import { describe, it, expect, vi } from 'vitest';
import {
  parseGitHubRef,
  fetchSkillFromGitHub,
  fetchSkillsFromGitHub,
  GitHubError,
} from './github';

describe('parseGitHubRef', () => {
  it('parses owner/repo', () => {
    expect(parseGitHubRef('octocat/hello')).toEqual({
      owner: 'octocat',
      repo: 'hello',
      subdir: '',
    });
  });

  it('parses owner/repo/sub/dir', () => {
    expect(parseGitHubRef('octocat/hello/skills/deploy')).toEqual({
      owner: 'octocat',
      repo: 'hello',
      subdir: 'skills/deploy',
    });
  });

  it('parses a full https github.com URL and strips trailing .git', () => {
    expect(parseGitHubRef('https://github.com/octocat/hello.git')).toEqual({
      owner: 'octocat',
      repo: 'hello',
      subdir: '',
    });
  });

  it('parses a tree URL, dropping tree/<branch> from the subdir', () => {
    expect(
      parseGitHubRef('https://github.com/octocat/hello/tree/main/skills/deploy'),
    ).toEqual({
      owner: 'octocat',
      repo: 'hello',
      subdir: 'skills/deploy',
    });
  });

  it('throws GitHubError(400) when fewer than owner+repo', () => {
    expect(() => parseGitHubRef('octocat')).toThrow(GitHubError);
    try {
      parseGitHubRef('octocat');
    } catch (err) {
      expect((err as GitHubError).status).toBe(400);
    }
  });
});

/** One canned fetch response shaped like the subset the module reads. */
function res(opts: { ok?: boolean; status?: number; json?: unknown; text?: string }) {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
  };
}

/**
 * Build a fake fetch routing the three GitHub endpoints by URL substring:
 * repo metadata, recursive tree, and raw file content (keyed by path).
 */
function fakeFetch(opts: {
  defaultBranch?: string;
  tree: Array<{ path: string; type: string; size?: number }>;
  raw: Record<string, string>;
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/git/trees/')) {
      return res({ json: { tree: opts.tree } });
    }
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      const path = url.split(/\/main\/|\/[^/]+\//).pop() ?? '';
      // Match the trailing path after branch by checking each known raw key.
      for (const key of Object.keys(opts.raw)) {
        if (url.endsWith(`/${key}`)) return res({ text: opts.raw[key] });
      }
      return res({ ok: false, status: 404, text: '' });
    }
    // Repo metadata endpoint.
    return res({ json: { default_branch: opts.defaultBranch ?? 'main' } });
  });
}

describe('fetchSkillFromGitHub', () => {
  const tree = [
    { path: 'SKILL.md', type: 'blob', size: 120 },
    { path: 'scripts/run.sh', type: 'blob', size: 80 },
    { path: 'logo.png', type: 'blob', size: 4096 },
    { path: 'huge.txt', type: 'blob', size: 200 * 1024 },
    { path: 'scripts', type: 'tree' },
  ];
  const raw = {
    'SKILL.md': '# Skill\nDoes a thing.\n',
    'scripts/run.sh': '#!/usr/bin/env bash\necho hi\n',
  };

  it('returns text files with stripped paths, skipping binary and oversized', async () => {
    const fetchMock = fakeFetch({ tree, raw });
    const skill = await fetchSkillFromGitHub('octocat/hello', { fetch: fetchMock });

    expect(skill.source).toBe('github');
    expect(skill.sourceRef).toBe('octocat/hello');
    expect(skill.slug).toBe('octocat-hello');
    expect(skill.name).toBe('hello');

    const paths = skill.files.map((f) => f.path).sort();
    expect(paths).toEqual(['SKILL.md', 'scripts/run.sh']);
    expect(skill.files).toHaveLength(2);

    // logo.png (binary) and huge.txt (>100KB) must be excluded.
    expect(paths).not.toContain('logo.png');
    expect(paths).not.toContain('huge.txt');
  });

  it('strips the subdir prefix from paths and identity', async () => {
    const subTree = [
      { path: 'skills/deploy/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/deploy/scripts/run.sh', type: 'blob', size: 60 },
      { path: 'skills/other/SKILL.md', type: 'blob', size: 50 },
    ];
    const subRaw = {
      'skills/deploy/SKILL.md': '# Deploy\n',
      'skills/deploy/scripts/run.sh': '#!/bin/sh\n',
    };
    const fetchMock = fakeFetch({ tree: subTree, raw: subRaw });

    const skill = await fetchSkillFromGitHub('octocat/hello/skills/deploy', {
      fetch: fetchMock,
    });

    expect(skill.sourceRef).toBe('octocat/hello/skills/deploy');
    expect(skill.slug).toBe('octocat-hello-skills-deploy');
    expect(skill.name).toBe('hello/skills/deploy');

    const paths = skill.files.map((f) => f.path).sort();
    expect(paths).toEqual(['SKILL.md', 'scripts/run.sh']);
    // The sibling skill outside the subdir must not leak in.
    expect(skill.files).toHaveLength(2);
  });

  it('throws GitHubError(404) when the repo is missing', async () => {
    const fetchMock = vi.fn(async () => res({ ok: false, status: 404 }));
    await expect(
      fetchSkillFromGitHub('octocat/missing', { fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws GitHubError(422) when no skill files are found', async () => {
    const fetchMock = fakeFetch({ tree: [{ path: 'logo.png', type: 'blob', size: 10 }], raw: {} });
    await expect(
      fetchSkillFromGitHub('octocat/hello', { fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('fetchSkillsFromGitHub', () => {
  it('splits a multi-skill repo into one RawSkill per SKILL.md dir', async () => {
    const tree = [
      { path: 'commit-helper/SKILL.md', type: 'blob', size: 100 },
      { path: 'commit-helper/scripts/run.sh', type: 'blob', size: 60 },
      { path: 'deploy-preview/SKILL.md', type: 'blob', size: 80 },
      { path: 'README.md', type: 'blob', size: 40 }, // top-level, no SKILL.md parent → ignored
    ];
    const raw = {
      'commit-helper/SKILL.md': '# Commit Helper\n',
      'commit-helper/scripts/run.sh': '#!/bin/sh\necho hi\n',
      'deploy-preview/SKILL.md': '# Deploy Preview\n',
      'README.md': '# repo\n',
    };
    const fetchMock = fakeFetch({ tree, raw });

    const skills = await fetchSkillsFromGitHub('octocat/hello', { fetch: fetchMock });
    expect(skills).toHaveLength(2);

    const byName = Object.fromEntries(skills.map((s) => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(['commit-helper', 'deploy-preview']);

    const commit = byName['commit-helper'];
    expect(commit.source).toBe('github');
    expect(commit.slug).toBe('octocat-hello-commit-helper');
    expect(commit.sourceRef).toBe('octocat/hello/commit-helper');
    // Files are relative to the skill dir (SKILL.md at the skill's root).
    expect(commit.files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'scripts/run.sh']);

    const deploy = byName['deploy-preview'];
    expect(deploy.slug).toBe('octocat-hello-deploy-preview');
    // The sibling skill's files must not leak in.
    expect(deploy.files.map((f) => f.path)).toEqual(['SKILL.md']);
  });

  it('splits skill dirs found under a subdir', async () => {
    const tree = [
      { path: 'skills/alpha/SKILL.md', type: 'blob', size: 50 },
      { path: 'skills/beta/SKILL.md', type: 'blob', size: 50 },
      { path: 'other/gamma/SKILL.md', type: 'blob', size: 50 }, // outside subdir → excluded
    ];
    const raw = {
      'skills/alpha/SKILL.md': '# Alpha\n',
      'skills/beta/SKILL.md': '# Beta\n',
    };
    const fetchMock = fakeFetch({ tree, raw });

    const skills = await fetchSkillsFromGitHub('octocat/hello/skills', { fetch: fetchMock });
    expect(skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    expect(skills.find((s) => s.name === 'alpha')!.slug).toBe('octocat-hello-skills-alpha');
    expect(skills.find((s) => s.name === 'alpha')!.sourceRef).toBe('octocat/hello/skills/alpha');
  });

  it('returns a single whole-repo skill when no SKILL.md exists (fallback)', async () => {
    const tree = [
      { path: 'index.md', type: 'blob', size: 30 },
      { path: 'helper.txt', type: 'blob', size: 20 },
    ];
    const raw = { 'index.md': '# hi\n', 'helper.txt': 'notes\n' };
    const fetchMock = fakeFetch({ tree, raw });

    const skills = await fetchSkillsFromGitHub('octocat/hello', { fetch: fetchMock });
    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe('octocat-hello');
    expect(skills[0].name).toBe('hello');
    expect(skills[0].files.map((f) => f.path).sort()).toEqual(['helper.txt', 'index.md']);
  });

  it('treats a subdir pointing at a single skill dir as one skill', async () => {
    const tree = [
      { path: 'skills/deploy/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/deploy/scripts/run.sh', type: 'blob', size: 60 },
      { path: 'skills/other/SKILL.md', type: 'blob', size: 50 },
    ];
    const raw = {
      'skills/deploy/SKILL.md': '# Deploy\n',
      'skills/deploy/scripts/run.sh': '#!/bin/sh\n',
    };
    const fetchMock = fakeFetch({ tree, raw });

    const skills = await fetchSkillsFromGitHub('octocat/hello/skills/deploy', {
      fetch: fetchMock,
    });
    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe('octocat-hello-skills-deploy');
    expect(skills[0].name).toBe('hello/skills/deploy');
    expect(skills[0].files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'scripts/run.sh']);
  });

  it('throws GitHubError(404) when the repo is missing', async () => {
    const fetchMock = vi.fn(async () => res({ ok: false, status: 404 }));
    await expect(
      fetchSkillsFromGitHub('octocat/missing', { fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws GitHubError(422) when no usable files are found', async () => {
    const fetchMock = fakeFetch({ tree: [{ path: 'logo.png', type: 'blob', size: 10 }], raw: {} });
    await expect(
      fetchSkillsFromGitHub('octocat/hello', { fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
