// One account of harvest processing demand per day. The overtime check, the labor calendar, the equipment calendar
// and the harvest chart all read this, so they cannot disagree. It is demand: what the plan asks of the crush line and
// the press. Whether the winery can do it is a comparison with the practical window, never assumed; deciding what
// waits is the scheduler's job (step 6).
const _PW=typeof crushHoursPerDay==='function'?{CRUSH_RATE,PRESS_CYCLE_HRS,MUST_GAL,JUICE_GAL,sortRate,crushHoursPerDay}:require('./winery.js');
const _PH=typeof binsOf==='function'?{binsOf}:require('./harvest.js');
function processingDemand(deliveries,lots,W,G){
  const rate=Math.min(_PW.CRUSH_RATE,_PW.sortRate(W.sort)),sorted=!!W.sort&&W.sort!=='none',pressT=W.press.tons,days={};
  const setup=G.crushSetupHrs??2,clean=G.pressCleanHrs??1,change=G.pressChangeHrs??0.5;
  const at=d=>days[d]||(days[d]={day:d,redTons:0,whiteTons:0,lineHrs:0,bins:0,mustGal:0,whiteLoads:0,redLoads:0,pressRunHrs:0,wines:new Set(),pressWines:new Set(),deliveries:[]});
  // receiving and crush, from the deliveries themselves
  for(const dv of deliveries){
    const x=at(dv.day);x.deliveries.push(dv);x.bins+=_PH.binsOf(dv.tons,G).bins;x.wines.add(dv.name);
    if(dv.color==='red'){x.redTons+=dv.tons;x.lineHrs+=dv.tons/rate;x.mustGal+=dv.tons*_PW.MUST_GAL}
    else{
      // whites go whole cluster to the press on the day they arrive, over the sorting table first if there is one
      x.whiteTons+=dv.tons;if(sorted)x.lineHrs+=dv.tons/rate;
      const ld=Math.ceil(dv.tons/pressT-1e-9);x.whiteLoads+=ld;x.pressRunHrs+=ld*_PW.PRESS_CYCLE_HRS.white;x.pressWines.add(dv.name);
    }
  }
  // reds come back to the same press when each fermentor is drained
  for(const L of lots)if(L.color==='red'&&L.pressDOY!=null){const x=at(L.pressDOY),ld=Math.ceil(L.tons/pressT-1e-9);x.redLoads+=ld;x.pressRunHrs+=ld*_PW.PRESS_CYCLE_HRS.red;x.pressWines.add(L.name)}
  const crushWin=_PW.crushHoursPerDay(G),pressAvail=Math.max(0,(G.workDayHrs??16)-clean);
  const list=Object.values(days).sort((a,b)=>a.day-b.day);
  for(const x of list){
    x.crushHrs=x.lineHrs>0?setup+x.lineHrs:0;                      // crush line in use: line time plus the day's setup and cleanup
    // the receiving crew's day: setup and cleanup, the line, and tipping unsorted white bins into the press
    x.receiveHrs=x.redTons+x.whiteTons>0?setup+x.lineHrs+(sorted?0:x.whiteTons/_PW.CRUSH_RATE):0;
    x.changeHrs=x.pressWines.size>1?change*(x.pressWines.size-1):0; // changeovers between wines on the press
    x.pressHrs=x.pressRunHrs>0?x.pressRunHrs+x.changeHrs+clean:0;    // press time including cleaning
    x.lineOver=Math.max(0,x.lineHrs-crushWin);x.pressOver=Math.max(0,x.pressRunHrs+x.changeHrs-pressAvail);
    x.shared=x.whiteLoads>0&&x.redLoads>0;
  }
  return {days:list,byDay:days,rate,pressT,window:crushWin,pressAvail,setup,clean,change,
    caps:{redTonsDay:crushWin*rate,whiteTonsDay:Math.floor(pressAvail/_PW.PRESS_CYCLE_HRS.white)*pressT,theoreticalRedTonsDay:(G.crushShifts*G.crushShiftHrs)*rate}};
}
if(typeof module!=='undefined')module.exports={processingDemand};
