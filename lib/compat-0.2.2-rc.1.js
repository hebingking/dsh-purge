// Local adaptation for the installed 0.2.2-rc.1 Web and desktop runtimes.
import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_HOST = '0.2.2-rc.1';

export function adaptTargetFiles(files, aiBase, version) {
  if (version !== LOCAL_HOST) return files;
  const existing = (...parts) => parts.map(p => path.join(aiBase, ...p)).filter(p => fs.existsSync(p));
  files['deliverables-prompt'] = existing(['dsh-deliverable-file-references', 'lib', 'index.js']);
  files['tool-executor-ptc'] = existing(
    ['dsh-tool-executor-ptc', 'lib', 'index.js'],
    ['dsh-tool-executor-ptc', 'lib', 'types', 'ptc.js']);
  files['tools-pipeline'] = existing(
    ['dsh-tools', 'lib', 'pipeline.js'],
    ['dsh-tools', 'lib', 'types', 'pipeline.js']);
  return files;
}

export function adaptPatchDefinitions(patches, version) {
  if (version !== LOCAL_HOST) return;
  const byId = new Map(patches.map(p => [p.id, p]));
  const p14 = byId.get(14);
  p14.skipIfMarked = true;
  p14.replacements.push({
    pattern: 'const outcome = await approval.approver.request({\n'
      + '\t\tagent: approval.agent,\n\t\ttoolName: approval.toolName,\n\t\tcallId: approval.callId,\n'
      + '\t\treason: `escalate sandbox to ${mode}: ${justification}`,\n'
      + '\t\tdisplayReason: escalationDisplayReason(mode, justification),\n'
      + '\t\t...approval.signal ? { signal: approval.signal } : {}\n\t});',
    replace: 'const outcome = approval.approver !== undefined && approval.agent !== undefined ? await approval.approver.request({\n'
      + '\t\tagent: approval.agent,\n\t\ttoolName: approval.toolName,\n\t\tcallId: approval.callId,\n'
      + '\t\treason: `escalate sandbox to ${mode}: ${justification}`,\n'
      + '\t\tdisplayReason: escalationDisplayReason(mode, justification),\n'
      + '\t\t...approval.signal ? { signal: approval.signal } : {}\n\t}) : "allowed-once";',
    expect: 1,
  });

  // 0.2.2 shares requirePresent() between edit and delete. Preserve delete semantics.
  const p17 = byId.get(17);
  p17.skipIfMarked = true;
  p17.replacements.push({
    pattern: '\teditIntent(target, actor) {\n\t\treturn this.requirePresent(target, actor, "edit");\n\t}',
    replace: '\teditIntent(target, actor) {\n\t\t// [dsh-purge] observation bypass: edits are unconditional (no read-first gate).\n\t\treturn void 0;\n\t}',
    expect: 1,
  });

  // Tools became provider-owned in 0.2.2: retain the separately assembled tools.
  const p40 = byId.get(40);
  p40.skipIfMarked = true;
  p40.replacements = [{
    pattern: '\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));\n'
      + '\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return {\n\t\t\t...transformed,\n\t\t\ttools\n\t\t};\n'
      + '\t\tconst requiredContexts = new Set([...contextByName.values()].filter((entry) => entry.required === true).map((entry) => entry.name));\n'
      + '\t\treturn {\n\t\t\t...transformed,\n\t\t\ttools,\n'
      + '\t\t\tsections: completeSection === void 0 ? transformed.sections : [completeSection],\n'
      + '\t\t\tcontexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts\n\t\t};',
    replace: '\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));\n'
      + '\t\tconst dshPurgeSections = (transformed.sections || []).filter((s) => String(s?.name || "").startsWith("dsh-purge") && String(s.text || "").length > 0);\n'
      + '\t\tconst dshPurgeRest = (transformed.sections || []).filter((s) => !String(s?.name || "").startsWith("dsh-purge"));\n'
      + '\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return { ...transformed, tools, sections: [...dshPurgeSections, ...dshPurgeRest] }; // [dsh-purge] every mode keeps system inject\n'
      + '\t\tconst requiredContexts = new Set([...contextByName.values()].filter((entry) => entry.required === true).map((entry) => entry.name));\n'
      + '\t\treturn {\n\t\t\t...transformed,\n\t\t\ttools,\n'
      + '\t\t\tsections: completeSection === void 0 ? [...dshPurgeSections, ...dshPurgeRest] : [...dshPurgeSections, ...dshPurgeRest.filter((s) => String(s?.name || "") !== String(completeSection.name || "")), { ...completeSection }], // [dsh-purge] complete prompt keeps inject + agent-instructions\n'
      + '\t\t\tcontexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts\n\t\t};',
    expect: 1,
  }];

  const p74 = byId.get(74);
  p74.replacements = [{
    pattern: '\t\ttry {\n\t\t\tconst assembly = await this.loopCtx.systemPrompt.assemble({\n',
    replace: '\t\ttry {\n'
      + '\t\t\tconst dshPurgePrepare = globalThis.__dshPurgePrepareAssemble;\n'
      + '\t\t\tlet dshPurgePrompt = null;\n'
      + '\t\t\tif (typeof dshPurgePrepare === "function") {\n'
      + '\t\t\t\ttry { dshPurgePrompt = dshPurgePrepare(this.loopCtx); } catch { /* [dsh-purge] prepare assemble before this step */ }\n'
      + '\t\t\t}\n'
      + '\t\t\tconst dshPurgeAssemble = dshPurgePrompt && typeof dshPurgePrompt.assemble === "function" ? dshPurgePrompt : this.loopCtx.systemPrompt;\n'
      + '\t\t\tconst assembly = await dshPurgeAssemble.assemble({\n',
    expect: 1,
  }];

  const p67 = byId.get(67);
  p67.skipIfMarked = true;
  p67.replacements = [{
    pattern: /^([\t ]+)if \(turnEnds && decision\.messages\.length === 0\) break;\n\1if \(phase\.step === 0 && decision\.messages\.length === 0\) \{\n/m,
    replace: '$1if (turnEnds && (decision.messages?.length ?? 0) === 0) break; // [dsh-purge] guard undefined messages\n'
      + '$1if (phase.step === 0 && (decision.messages?.length ?? 0) === 0) { // [dsh-purge] guard undefined messages\n',
    expect: 1,
  }];

  byId.get(60).file = ['tool-executor-ptc'];
  byId.get(62).file = ['tools-pipeline'];

  // The desktop bundle now places an inlined mime table after its imports.
  const p82 = byId.get(82);
  const desktopImport = 'import { REMOTE_STREAM_MUX_PATH, parseRemoteStreamServerMessage } from "@deepseek-ai/dsh-api-gateway/stream-protocol";\n';
  p82.replacements.push({
    pattern: desktopImport,
    replace: desktopImport
      + '// [dsh-purge-82] 双击 exe 从 explorer 继承 env 时常缺 DSH_PROFILE\n'
      + 'if (typeof process !== "undefined" && process.env && !process.env.DSH_PROFILE) process.env.DSH_PROFILE = "desktop";\n',
    expect: 1,
  });
  // Their replacements retain the original anchor, so repeated applies must stop at the marker.
  byId.get(92).skipIfMarked = true;
  byId.get(93).skipIfMarked = true;
}
