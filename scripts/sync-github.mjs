import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const content = fileURLToPath(new URL('../content/', import.meta.url));
const projects = JSON.parse(await readFile(join(content, 'projects.json'), 'utf8'));
let metadata = {};
try { metadata = JSON.parse(await readFile(join(content, 'github.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ilia-portfolio' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
async function get(path, optional = false) {
  const response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(10000) });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json();
}
let success = 0;
for (const project of projects) {
  try {
    const path = `/repos/ValekusVachpekus/${encodeURIComponent(project.repo)}`;
    const [repo, release] = await Promise.all([get(path), get(`${path}/releases/latest`, true)]);
    metadata[project.repo] = {
      createdAt: repo.created_at,
      releasedAt: release?.published_at ?? null,
      languages: repo.language ? [repo.language] : [],
      description: repo.description,
      fetchedAt: new Date().toISOString(),
    };
    success++;
    console.log(`Updated ${project.repo}`);
  } catch (error) {
    console.warn(`Kept existing metadata for ${project.repo}: ${error.message}`);
    // A blocked network affects all repos; avoid repeating the same timeout 17 times.
    if (success === 0 && (error.cause || error.name === 'TimeoutError')) break;
  }
}
if (success) await writeFile(join(content, 'github.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`${success}/${projects.length} repositories updated. Manual descriptions and dates preserved.`);
