// Tavern Helper displays Script.name; it has no separate version field.
// Identity/version authority remains the verified build marker, never this label.
export function updatedScriptName(name, version) {
  if (typeof name !== 'string' || typeof version !== 'string'
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/.test(version)) {
    throw new TypeError('Invalid script update name/version');
  }
  // Replace even an already stale suffix, preserving the user's title/separator.
  const suffix = /(^|[\s·—–-])v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\s*$/i;
  return suffix.test(name) ? name.replace(suffix, (_, separator) => separator + version) : name.trimEnd() + ' ' + version;
}

// Called only inside the host's guarded synchronous tree update, after full
// package verification. Keep every other field from the latest host tree.
export function applyScriptUpdate(script, content, version) {
  const name = updatedScriptName(script.name, version);
  script.content = content;
  script.name = name;
  return name;
}
