import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adaptPatchDefinitions, adaptTargetFiles } from '../lib/compat-0.2.2-rc.1.js';

// Pin discovery to a synthetic host before importing core. No real profile is modified.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-purge-compat-test-'));
const aiBase = path.join(root, 'host', 'node_modules', '@deepseek-ai');
fs.mkdirSync(path.join(aiBase, 'dsh-agent-instructions', 'lib'), {recursive:true});
fs.mkdirSync(path.join(aiBase, 'dsh'), {recursive:true});
fs.writeFileSync(path.join(aiBase, 'dsh', 'package.json'), JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.2-rc.1'}));
process.env.DSH_BASE = aiBase;
process.env.DSH_HOME = path.join(root, 'home');
process.env.DSH_SURFACE = 'web';
const core = await import('../lib/core.js');
const { rewritePnpmAllowBuilds, parseAllowBuildLine, validateAllowBuildRewrite } = await import('../lib/profile-insert.js');
const patch = id => core.ALL_PATCHES.find(p=>p.id===id);
after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('other host versions retain their patch definitions and file mappings',()=>{
  const definitions = [{id:14,replacements:[]}];
  const before = structuredClone(definitions);
  adaptPatchDefinitions(definitions,'0.2.1-rc.5');
  assert.deepEqual(definitions,before);
  const files = {'deliverables-prompt':['old-file']};
  assert.equal(adaptTargetFiles(files,aiBase,'0.2.1-rc.5'),files);
  assert.deepEqual(files,{'deliverables-prompt':['old-file']});
});

test('0.2.2 maps moved provider files and omits absent targets',()=>{
  for(const relative of ['dsh-deliverable-file-references/lib/index.js','dsh-tool-executor-ptc/lib/index.js','dsh-tools/lib/pipeline.js']){
    const fp=path.join(aiBase,relative);fs.mkdirSync(path.dirname(fp),{recursive:true});fs.writeFileSync(fp,'');
  }
  const files=adaptTargetFiles({},aiBase,'0.2.2-rc.1');
  assert.deepEqual(files['deliverables-prompt'],[path.join(aiBase,'dsh-deliverable-file-references/lib/index.js')]);
  assert.deepEqual(files['tool-executor-ptc'],[path.join(aiBase,'dsh-tool-executor-ptc/lib/index.js')]);
  assert.deepEqual(files['tools-pipeline'],[path.join(aiBase,'dsh-tools/lib/pipeline.js')]);
});

test('sandbox approval retains display reason, routing, rejection and cancellation outcomes',async()=>{
  const replacement=patch(14).replacements.at(-1).replace;
  const approve=new Function('escalationDisplayReason',`return async function(approval) { const mode='workspace-write', justification='fixture'; ${replacement} return outcome; }`)(
    (mode,justification)=>({en:`${mode}: ${justification}`}));
  assert.equal(await approve({}),'allowed-once');
  let info;
  for(const outcome of ['allowed-once','rejected','cancelled']){
    assert.equal(await approve({agent:{},approver:{request:async request=>(info=request,outcome)}}),outcome);
    assert.deepEqual(info.displayReason,{en:'workspace-write: fixture'});
  }
});

test('edit adaptation does not remove the shared delete observation check',()=>{
  const input='class Observation {\n\teditIntent(target, actor) {\n\t\treturn this.requirePresent(target, actor, "edit");\n\t}\n'
    +'\tdeleteIntent(target, actor) { return this.requirePresent(target, actor, "delete"); }\n'
    +'\trequirePresent() { throw new Error("requires reading"); }\n}';
  const r=core.applyReplacementsToText(input,patch(17),'fixture.js');
  assert.equal(r.changed,true);
  const Observation=new Function(r.text+'; return Observation;')();
  assert.equal(new Observation().editIntent({},{}),undefined);
  assert.throws(()=>new Observation().deleteIntent({},{}),/requires reading/);
  assert.equal(core.applyReplacementsToText(r.text,patch(17),'fixture.js').changed,false);
});

test('all complete/suppressed prompt modes retain tools, injected sections and required contexts',async()=>{
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const assemble=new AsyncFunction('scopeTarget','scope','assembly','context','completeSection','runtimeContextSuppressed','contextByName','tools',patch(40).replacements[0].replace);
  const inject={name:'dsh-purge:fixture',text:'inject'};
  const complete={name:'complete',text:'complete'};
  const other={name:'agent-instructions',text:'other'};
  const contexts=[{name:'required'},{name:'optional'}];
  const tools=[{name:'fixture-tool'}];
  const ctx={ctx:{waterfall:async()=>({sections:[other,complete,inject],contexts,tools:['wrong-source']})}};
  for(const completeSection of [undefined,complete])for(const suppressed of [false,true]){
    const r=await assemble.call(ctx,()=>null,null,{}, {},completeSection,suppressed,new Map([['required',{name:'required',required:true}]]),tools);
    assert.equal(r.tools,tools);
    assert.equal(r.sections[0],inject);
    assert.equal(r.sections.filter(s=>s.name==='complete').length,1);
    assert.deepEqual(r.contexts,suppressed?[contexts[0]]:contexts);
  }
});

test('prepare hook runs before assembly and retains model and tool selections',async()=>{
  const p=patch(74);
  const original=p.replacements[0].pattern+'\t\t\t\tmodelSelection: selection,\n\t\t\t\ttoolSet\n\t\t\t});\n\t\t\treturn assembly;\n\t\t} finally {}';
  const code=core.applyReplacementsToText(original,p,'fixture.js').text;
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('selection','toolSet',code);
  const order=[];
  const selection={model:'fixture'},toolSet={tool:true};
  const prepared={assemble:async c=>(order.push('assemble'),c)};
  const prior=globalThis.__dshPurgePrepareAssemble;
  try{
    globalThis.__dshPurgePrepareAssemble=()=>{order.push('prepare');return prepared;};
    const r=await run.call({loopCtx:{systemPrompt:{assemble:()=>assert.fail('prepared prompt must win')}}},selection,toolSet);
    assert.equal(r.modelSelection,selection);assert.equal(r.toolSet,toolSet);
    assert.deepEqual(order,['prepare','assemble']);
  }finally{globalThis.__dshPurgePrepareAssemble=prior;}
});

test('message guards handle absent messages with tabs and spaces',()=>{
  for(const indent of ['\t\t\t','    ']){
    const original=`${indent}if (turnEnds && decision.messages.length === 0) break;\n${indent}if (phase.step === 0 && decision.messages.length === 0) {\n`;
    const r=core.applyReplacementsToText(original,patch(67),'fixture.js');
    assert.equal(r.changed,true);
    const run=new Function('decision','turnEnds','phase',`while(true){ ${r.text} return 'empty'; } return 'nonempty'; } return 'ended';`);
    assert.equal(run({},true,{step:1}),'ended');
    assert.equal(run({},false,{step:0}),'empty');
    assert.equal(run({messages:[{}]},false,{step:0}),'nonempty');
  }
});

test('desktop profile fallback preserves explicit profile and applies once',()=>{
  const p=patch(82);
  const input=p.replacements.at(-1).pattern+'//#region inlined-mime-table\n';
  const r=core.applyReplacementsToText(input,p,'main.js');
  assert.equal(r.changed,true);
  const code=r.text.split('\n').slice(1).join('\n');
  const fallback=new Function('process',code);
  const empty={env:{}};fallback(empty);assert.equal(empty.env.DSH_PROFILE,'desktop');
  const configured={env:{DSH_PROFILE:'custom'}};fallback(configured);assert.equal(configured.env.DSH_PROFILE,'custom');
  assert.equal(core.applyReplacementsToText(r.text,p,'main.js').changed,false);
});

test('desktop exit log patches are idempotent',()=>{
  for(const id of [92,93]){
    const p=patch(id),first=core.applyReplacementsToText(p.replacements[0].pattern,p,'main.js');
    assert.equal(first.changed,true);
    assert.equal(core.applyReplacementsToText(first.text,p,'main.js').changed,false);
    assert.equal(first.text.split(p.markers[0]).length-1,1);
  }
});

test('pnpm source approval survives repeated rewrites without altering other dependencies',()=>{
  const profile=path.join(root,'profile');fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({packageManager:'pnpm@11.21.0'}));
  const key='dsh-purge@https://codeload.github.com/hebingking/dsh-purge/tar.gz/refs/heads/master';
  const original=`packages:\n  - .\nallowBuilds:\n  "${key}": true\n  other-package: false\n  dsh-purge@https: true\n`;
  const r=rewritePnpmAllowBuilds(original,profile);
  assert.equal(validateAllowBuildRewrite(r),true);
  const approvals=r.split('\n').map(parseAllowBuildLine).filter(Boolean);
  assert(approvals.some(x=>x.key===key&&x.value==='true'));
  assert(approvals.some(x=>x.key==='dsh-purge'&&x.value==='true'));
  assert(approvals.some(x=>x.key==='other-package'&&x.value==='false'));
  assert(!approvals.some(x=>x.key==='dsh-purge@https'));
  assert.equal(rewritePnpmAllowBuilds(r,profile),r);
});
