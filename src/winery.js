// The resolved winery: equipment facts that more than one part of the model needs, kept in one place so the lot
// simulation, the cellar flow, the labor calendar and the equipment list all see the same press, sorting line and jackets.
const PRESSES=[{upTo:25,tons:3,cost:55000},{upTo:60,tons:5,cost:80000},{upTo:Infinity,tons:8,cost:110000}];
const PRESS_CYCLE_HRS={red:3,white:3.5};    // hours per load: reds drain and press, whites whole-cluster press cycles run longer
const CRUSH_RATE=8;                          // destemmer or receiving line, tons per hour, before sorting limits it
const CRUSH_SETUP_HRS={red:1.5,white:0.5};   // line setup and teardown per lot
const SORT_LABOR={none:1,hand:2.5,optical:1.3}; // crew hours per ton on the line
const JACKET_BAND=1/3;                       // jacket covers about a third of the wall height
const _S=typeof nutrientPlan==='function'?{nutrientPlan}:require('./supplies.js');
function sortRate(sort){return (typeof SORT_RATE!=='undefined'?SORT_RATE:require('./core.js').SORT_RATE)[sort]??1e9}
// Hours the crush line runs in a day: crush shifts less setup and cleanup (VEN 235: one 8-hour shift less 2 hours).
function crushHoursPerDay(G){return Math.max(1,G.crushShifts*G.crushShiftHrs-G.crushSetupHrs)}
// The most fruit one day can take for a given color. Reds are limited by the crush line and sorting inside the crush
// window; whites go whole cluster to the press, which can cycle through the working day, and through sorting if any.
function pickCapTons(color,W,G){
  const hrs=crushHoursPerDay(G), sr=sortRate(W.sort);
  if(color==='red')return hrs*Math.min(CRUSH_RATE,sr);
  const press=Math.floor(G.workDayHrs/PRESS_CYCLE_HRS.white)*W.press.tons;
  return W.sort&&W.sort!=='none'?Math.min(press,hrs*sr):press;
}
// Inverse standard normal (Acklam), for placing picks on a variety's arrival curve.
function normInv(p){
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],
   b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155211027],
   c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],
   d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416],q=Math.min(p,1-p);
  let x;
  if(q<0.02425){const r=Math.sqrt(-2*Math.log(q));x=(((((c[0]*r+c[1])*r+c[2])*r+c[3])*r+c[4])*r+c[5])/((((d[0]*r+d[1])*r+d[2])*r+d[3])*r+1)}
  else{const r=p-0.5,s=r*r;x=(((((a[0]*s+a[1])*s+a[2])*s+a[3])*s+a[4])*s+a[5])*r/(((((b[0]*s+b[1])*s+b[2])*s+b[3])*s+b[4])*s+1);return x}
  return p<0.5?x:-x;
}
// Pick days for a variety: its tonnage arrives on a normal curve (mean pick day, spread in days, VEN 235), cut into n
// equal slices; each pick sits at the middle of its slice. Deterministic, so a stress harvest is a change of mean or spread.
function pickDays(v,n,G){
  const sd=(v.pickSD??2)*(G.harvestSpread??1),out=[];
  for(let k=0;k<n;k++){let d=Math.round((v.pick??270)+(n>1?sd*normInv((k+0.5)/n):0));if(k&&d<=out[k-1])d=out[k-1]+1;out.push(d)}
  return out;
}
function pressFor(allTons){return PRESSES.find(p=>allTons<=p.upTo)}
function crushHours(tons,color,sort){return tons/Math.min(CRUSH_RATE,sortRate(sort))+CRUSH_SETUP_HRS[color]}
// Cooling a jacket can deliver to the tank it is on: jacket area (a third of the wall of a tank 1.5 times as tall as wide)
// times the heat flux the glycol can pull through it. The chiller, not the jacket, is usually what limits.
function jacketBTU(tankGal,G){
  const ft3=tankGal/7.48, D=Math.cbrt(4*ft3/(1.5*Math.PI)), area=Math.PI*D*1.5*D*JACKET_BAND;
  return area*G.jacketFlux;
}
// The winery as the lot simulation needs to see it.
function wineryFor(V,G,redTankGal){
  const allTons=V.reduce((a,v)=>a+v.cases/v.cpt,0), press=pressFor(allTons);
  return {allTons,press,sort:G.sort||'none',redTankGal,coolBTU:redTankGal?jacketBTU(redTankGal,G):0,G};
}
// Parameters for one red lot in this winery. The only place a lot simulation is set up.
// Nutrients come from the same plan that prices them, so the kinetics ferment what the winery actually added.
function lotParams(v,tons,pick,W){
  const n=_S.nutrientPlan(v,W.G);
  return {tons,brix:v.brix,yan:W.G.yanHarvest,dapDay:n.added>0?1.5:-1,dapAmt:n.added,soakDays:v.soak??3,soakF:50,fruitF:65,setF:v.setF??85,coolBTU:W.coolBTU,vessel:'tank',ambF:62,swingF:0,emDays:v.ext??0,yeast:'robust',
   malic:2.5,ml:'seq',mlHeat:false,mlHeatF:68,winterF:52,summerF:68,barrelF:58,harvestDOY:pick,pressLoad:W.press.tons,pressCycle:PRESS_CYCLE_HRS.red,
   binTons:0.5,crushRate:CRUSH_RATE,setupHrs:CRUSH_SETUP_HRS.red,sort:W.sort,mustGal:180,headspace:20,freeRun:115,pressGal:45,leesPct:4,pressHandling:'blend',barrelRule:'spring',settleDays:10};
}
if(typeof module!=='undefined')module.exports={PRESSES,PRESS_CYCLE_HRS,SORT_LABOR,CRUSH_RATE,sortRate,crushHoursPerDay,pickCapTons,normInv,pickDays,pressFor,crushHours,jacketBTU,wineryFor,lotParams};
