// One record shape for anything that departs from the plan as the winemaker set it.
// Classes run from least to most serious. The model never resolves a problem by quietly changing how a wine is made;
// it records an exception instead, so the page can show the originating constraint, what it affects, and what could be done.
// basis says what kind of limit was met: physical (cannot be done), practice (a preferred way of working), warning (a
// threshold that needs the winemaker's review) or authorization (allowed only if the winemaker says so).
const EXC_CLASS=[
 ['asPlanned','Feasible as planned'],
 ['overtime','Feasible with overtime or extra shifts'],
 ['reschedule','Feasible with rescheduling'],
 ['method','Feasible only by changing winemaking methods'],
 ['infeasible','Physically infeasible']
];
function exception(cls,o){
  if(!EXC_CLASS.some(([k])=>k===cls))throw new Error('unknown exception class '+cls);
  return {cls,basis:o.basis||'practice',constraint:o.constraint,wine:o.wine,lot:o.lot??null,process:o.process,what:o.what,consequences:o.consequences||'',remedies:o.remedies||''};
}
if(typeof module!=='undefined')module.exports={EXC_CLASS,exception};
