/**
 * GitHub skill fetcher — imports a skill from a public GitHub repo into a
 * `RawSkill` for the audit pipeline.
 *
 * Pure-ish and host-side: it reads remote DATA (repo metadata, file tree, raw
 * file bytes) over the GitHub REST + raw endpoints, but never executes or obeys
 * any skill content. `fetch` is injectable so tests run offline with a fake.
 *
 * The returned `RawSkill.source` is always `'github'`; downstream the host
 * `auditSkill()` decides the verdict — this module only gathers the bytes.
 */

import type { RawSkill, SkillFile } from '@jenz/shared';

/** Error carrying an HTTP-ish status so the route can map it to a response. */
export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** A parsed reference to a skill location inside a GitHub repo. */
export interface GitHubRef {
  owner: string;
  repo: string;
  subdir: string;
}

/** Binary / asset extensions we never treat as skill source text. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
  'pdf', 'zip', 'tar', 'gz', 'tgz', 'bz2', '7z', 'rar',
  'exe', 'dll', 'bin', 'so', 'dylib', 'o', 'a',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'wav', 'flac', 'ogg', 'webm',
  'jar', 'class', 'wasm', 'node',
]);

const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 50;

/**
 * Parse a GitHub reference into `{ owner, repo, subdir }`.
 *
 * Accepts `owner/repo`, `owner/repo/sub/dir`, a full
 * `https://github.com/owner/repo`, and a tree URL
 * `https://github.com/owner/repo/tree/<branch>/<subdir>` (the `tree/<branch>`
 * segments are dropped; the rest becomes the subdir). A trailing `.git` is
 * stripped. Throws `GitHubError(400)` if fewer than owner+repo are present.
 */
export function parseGitHubRef(input: string): GitHubRef {
  let rest = input.trim();

  // Strip a github.com URL prefix (with or without scheme / www).
  rest = rest.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (rest.toLowerCase().startsWith('github.com/')) {
    rest = rest.slice('github.com/'.length);
  }

  // Drop query string / fragment and any leading/trailing slashes.
  rest = rest.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');

  const segments = rest.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) {
    throw new GitHubError(`invalid GitHub ref: ${input}`, 400);
  }

  const owner = segments[0];
  let repo = segments[1].replace(/\.git$/i, '');

  let tail = segments.slice(2);
  // Drop a `tree/<branch>` (or `blob/<branch>`) prefix from the tail.
  if (tail.length >= 2 && (tail[0] === 'tree' || tail[0] === 'blob')) {
    tail = tail.slice(2);
  }

  const subdir = tail.join('/').replace(/^\/+|\/+$/g, '');
  return { owner, repo, subdir };
}

/** Minimal fetch surface the module relies on (lets tests pass a fake). */
type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const GITHUB_HEADERS = {
  'User-Agent': 'jenz-managed-skills',
  Accept: 'application/vnd.github+json',
} as const;

const RAW_HEADERS = {
  'User-Agent': 'jenz-managed-skills',
} as const;

/** A single entry in the recursive git-tree response we care about. */
interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

/** The lowercase extension of a path, or '' if none. */
function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Slugify a string: lowercase, non-alnum → '-', collapse repeats, trim '-'. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fetch a skill from a public GitHub repo and return it as a `RawSkill`.
 *
 * Resolves the repo's default branch, walks the recursive git tree, keeps the
 * text files under `subdir` (skipping binaries, oversized files, and capping at
 * 50), then reads each file's raw bytes. Paths in the result are relative to
 * `subdir`. Throws `GitHubError` on any failure so the caller fails closed.
 */
export async function fetchSkillFromGitHub(
  input: string,
  deps?: { fetch?: FetchLike },
): Promise<RawSkill> {
  const doFetch = (deps?.fetch ?? (globalThis.fetch as unknown as FetchLike));
  const { owner, repo, subdir } = parseGitHubRef(input);

  // 1. Repo metadata → default branch.
  const repoRes = await doFetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { ...GITHUB_HEADERS },
  });
  if (repoRes.status === 404) {
    throw new GitHubError('repo not found', 404);
  }
  if (!repoRes.ok) {
    throw new GitHubError(`GitHub repo fetch failed (${repoRes.status})`, 502);
  }
  const repoData = (await repoRes.json()) as { default_branch?: string };
  const branch = repoData.default_branch || 'main';

  // 2. Recursive git tree.
  const treeRes = await doFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { ...GITHUB_HEADERS } },
  );
  if (!treeRes.ok) {
    throw new GitHubError(`GitHub repo fetch failed (${treeRes.status})`, 502);
  }
  const treeData = (await treeRes.json()) as { tree?: TreeEntry[] };
  const tree = Array.isArray(treeData.tree) ? treeData.tree : [];

  // 3. Filter to the kept skill files.
  const prefix = subdir ? `${subdir}/` : '';
  const kept = tree
    .filter(
      (entry) =>
        entry.type === 'blob' &&
        typeof entry.path === 'string' &&
        entry.path.startsWith(prefix) &&
        (entry.size ?? 0) <= MAX_FILE_BYTES &&
        !BINARY_EXTENSIONS.has(extensionOf(entry.path)),
    )
    .slice(0, MAX_FILES);

  if (kept.length === 0) {
    throw new GitHubError('no skill files found', 422);
  }

  // 4. Read each file's raw content; skip on failure, strip the subdir prefix.
  const files: SkillFile[] = [];
  for (const entry of kept) {
    const rawRes = await doFetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path}`,
      { headers: { ...RAW_HEADERS } },
    );
    if (!rawRes.ok) continue;
    const content = await rawRes.text();
    files.push({ path: entry.path.slice(prefix.length), content });
  }

  if (files.length === 0) {
    throw new GitHubError('failed to read any skill file content', 502);
  }

  // 5. Assemble the RawSkill identity.
  const slug = subdir
    ? `${slugify(`${owner}-${repo}`)}-${slugify(subdir)}`
    : slugify(`${owner}-${repo}`);
  const name = subdir ? `${repo}/${subdir}` : repo;
  const sourceRef = subdir ? `${owner}/${repo}/${subdir}` : `${owner}/${repo}`;

  return { slug, name, files, source: 'github', sourceRef };
}
