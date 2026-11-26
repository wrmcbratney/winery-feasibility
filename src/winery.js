// The resolved winery: equipment facts that more than one part of the model needs, kept in one place so the lot
// simulation, the cellar flow, the labor calendar and the equipment list all see the same press, sorting line and jackets.
const PRESSES=[{upTo:25,tons:3,cost:55000},{upTo:60,tons:5,cost:80000},{upTo:Infinity,tons:8,cost:110000}];
const PRESS_CYCLE_HRS={red:3,white:3.5};    // hours per load: reds drain and press, whites whole-cluster press cycles run longer
const CRUSH_RATE=8;                          // destemmer or receiving line, tons per hour, before sorting limits it
const CRUSH_SETUP_HRS={red:1.5,white:0.5};   // line setup and teardown per lot
const SORT_LABOR={none:1,hand:2.5,optical:1.3}; // crew hours per ton on the line
const JACKET_BAND=1/3;
const MUST_GAL=180, JUICE_GAL=170;              // gallons of red must and of white juice per ton (lot ledger will refine)                       // jacket covers about a third of the wall height
const _S=typeof nutrientPlan==='function'?{nutrientPlan}:require('./supplies.js');
function sortRate(sort){return (typeof SORT_RATE!=='undefined'?SORT_RATE:require('./core.js').SORT_RATE)[sort]??1e9}
// Hours the crush line runs in a day: crush shifts less setup and cleanup (VEN 235: one 8-hour shift less 2 hours).
function crushHoursPerDay(G){return Math.max(1,G.crushShifts*G.crushShiftHrs-G.crushSetupHrs)}
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
   binTons:0.5,crushRate:CRUSH_RATE,setupHrs:CRUSH_SETUP_HRS.red,sort:W.sort,mustGal:MUST_GAL,headspace:20,freeRun:115,pressGal:45,leesPct:4,pressHandling:'blend',barrelRule:'spring',settleDays:10};
}
if(typeof module!=='undefined')module.exports={PRESSES,PRESS_CYCLE_HRS,SORT_LABOR,CRUSH_RATE,sortRate,crushHoursPerDay,MUST_GAL,JUICE_GAL,pressFor,crushHours,jacketBTU,wineryFor,lotParams};
