import path from 'path';

/**
 * Root for all workflow file I/O (write-file, list/read/move/delete-file).
 * Matches the directory served at /files/ and used by write-file, so files
 * written by one node are visible to the others. Subdirectories are allowed,
 * which lets workflows keep filesystem queues (e.g. queue/, processing/).
 */
export const FILES_ROOT = path.resolve(process.env.DATA_DIR ?? './data/files');

/**
 * Resolve a workflow-supplied relative path under FILES_ROOT, rejecting any
 * path that escapes the root (path traversal). Returns an absolute path.
 */
export const safeResolve = (relPath: string): string => {
  const target = path.resolve(FILES_ROOT, relPath);
  if (target !== FILES_ROOT && !target.startsWith(FILES_ROOT + path.sep)) {
    throw new Error(`path "${relPath}" escapes the data directory`);
  }
  return target;
};
