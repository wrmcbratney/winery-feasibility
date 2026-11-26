// Steady-state cellar flow: every lot of several overlapping vintages, day by day, by location, in gallons and vessels.
// Day 0 = Aug 1 of the harvest year. Vintages k=-3..1 are identical and offset by 365 days, so days 0 to 364
// are a normal year once the brand is running, with older vintages still in barrel or bottle.
const LOCS=[['pad','Crush pad'],['press','Press'],['redTank','Red ferment tanks'],['whiteTank','White tanks'],['storage','Lot tanks: ML and storage'],['blend','Blending and bottling tanks'],['barrel','Barrels'],['bottled','Bottled, not yet sold']];
const UNIT={pad:['bin','bins'],press:['press load','press loads'],redTank:['tank','tanks'],whiteTank:['tank','tanks'],storage:['tank','tanks'],blend:['tank','tanks'],barrel:['barrel','barrels'],bottled:['pallet','pallets']};
const AUG1=213, MIDOCT=288-213, MO=30.44, GAL_CASE=2.378, BBL=59.4, STD_TANK=[500,750,1000,1500,2000,2500,3000,4000,5000,6000,8000];
const flowCache={};
const _X=typeof exception==='function'?{exception}:require('./exceptions.js');
const _W=typeof lotParams==='function'?{wineryFor,lotParams,crushHours,jacketBTU,PRESS_CYCLE_HRS,SORT_LABOR,CRUSH_RATE,crushHoursPerDay,sortRate,MUST_GAL,JUICE_GAL}:require('./winery.js');
const _H=typeof fillFermentors==='function'?{sourcesOf,deliveriesFor,binsOf,fillFermentors}:require('./harvest.js');
const _P=typeof processingDemand==='function'?{processingDemand}:require('./processing.js');
function lotSim(v,tons,pick,W,simulate){
  const p=_W.lotParams(v,tons,pick,W),k=JSON.stringify(p);
  if(!flowCache[k])flowCache[k]=simulate(p);
  return flowCache[k];
}
const stdTank=gal=>STD_TANK.find(s=>s>=gal)||STD_TANK[STD_TANK.length-1];
function lotPlan(V,G,simulate){
  const lots=[], short={}, exc=[], seen=new Set(), flag=(key,cls,o)=>{if(!seen.has(key)){seen.add(key);exc.push(_X.exception(cls,o))}};
  const W=_W.wineryFor(V,G,stdTank(G.redFermGal)), pressT=W.press.tons, deliveries=[];
  _H.sourcesOf(V).forEach(src=>{
    const v=V[src.wi], wi=src.wi, red=v.color==='red', q=_W.lotParams(v,1,src.pick,W), hs=red?q.headspace/100:0.1;
    // working volume: the fermentor less the headspace the cap (reds) or foam (whites) needs
    const perTon=red?_W.MUST_GAL:_W.JUICE_GAL, tankGal=stdTank(red?G.redFermGal:G.whiteFermGal), capT=Math.min(G.lotTons,tankGal/(1+hs)/perTon);
    const dv=_H.deliveriesFor(src,G);deliveries.push(...dv);
    const fills=_H.fillFermentors(v,dv,capT,G), n=fills.length, total=src.tons;
    const bm=Math.min(v.bottle??(v.barrel>0?Math.round((red?6:0.5)+v.barrel+1):5),v.release),bottle=MIDOCT+bm*MO, release=MIDOCT+v.release*MO;
    fills.forEach((F,j)=>{
      const lt=F.tons, cases=v.cases*lt/total, pick=F.first, p=pick-AUG1, lastRel=F.last-pick, S=[];
      const seg=(loc,a,b,gal,units,x)=>{if(b>a)S.push({loc,a:p+a,b:p+b,gal,units,...x})};
      const ev=(loc,a,gal,units)=>S.push({loc,a:p+a,b:p+a+1,gal,units,ev:true});
      const bot=bottle-p, bl=bot-21, wineGal=v.cases*GAL_CASE*1.03;
      const barrelOut=inDay=>{
        let out=Math.min(inDay+v.barrel*MO,bl);
        if(inDay+v.barrel*MO>bl+7){short[wi]=(bl-inDay)/MO;
          flag('short'+wi,'method',{basis:'practice',constraint:'Bottling date',wine:v.name,process:'Barrel aging',what:`bottles before its barrel time is up: about ${Math.round((bl-inDay)/MO)} of ${v.barrel} months in barrel`,consequences:'less oak and less time on lees than intended',remedies:'move bottling later in the wine table, or accept the shorter barrel time'})}
        if(bl-out<60&&bl>out){
          flag('ext'+wi,'method',{basis:'practice',constraint:'Blending date',wine:v.name,process:'Barrel aging',what:`barrel time extended from ${v.barrel} to about ${((bl-inDay)/MO).toFixed(1)} months, so the wine goes straight from barrel to blending instead of spending ${Math.round(bl-out)} days in a lot tank`,consequences:'more oak contact and barrels held longer than set',remedies:'set bottling so the barrel time ends at blending, or allow a short tank stay'});
          out=bl}
        return out;
      };
      // receiving: each portion carries its share of its delivery's bins, so dividing a delivery between fermentors adds none
      F.picks.forEach(k=>ev('pad',k.day-pick,k.tons*_W.MUST_GAL,_H.binsOf(k.delivery.tons,G).bins*k.share));
      const tag=`${v.name} fermentor ${j+1}`,when=d=>dayLabel(d);
      if(red&&F.fill<F.policy.prefMin-1e-9){
        const below=F.fill<F.policy.warnMin-1e-9;
        flag('fill'+wi+'|'+j,below?'method':'reschedule',{basis:below?'warning':'practice',constraint:'Fermentor fill',wine:v.name,lot:j,process:'Fermentor filling',
          what:`${tag} closes ${Math.round(F.fill*100)}% full (${lt.toFixed(1)} of ${capT.toFixed(1)} tons) when its addition window ends ${when(Math.floor(F.addUntil))}`+(below?`, under the ${Math.round(F.policy.warnMin*100)}% level where cap management needs the winemaker's review`:`, under the preferred ${Math.round(F.policy.prefMin*100)}% fill`),
          consequences:'a fermentor committed for the whole ferment at low fill; cap and jacket work less well in a shallow tank',
          remedies:'a smaller fermentor, accept the partial fill if the cap can be worked, shift the pick within its authorized window, hold the fruit cold, or authorize a later addition to the fermentor before it'})}
      // whites have no cap to manage; a thin fill is a matter of tank use, reported against the same levels for now
      if(!red&&F.fill<(G.redPrefMinFill??50)/100-1e-9)flag('wfill'+wi+'|'+j,'reschedule',{basis:'practice',constraint:'Fermentor fill',wine:v.name,lot:j,process:'Fermentor filling',
          what:`${tag} closes ${Math.round(F.fill*100)}% full (${lt.toFixed(1)} of ${capT.toFixed(1)} tons) when its addition window ends ${when(Math.floor(F.addUntil))}`,
          consequences:'a tank committed to a small volume of juice',remedies:'a smaller tank, a later addition to the tank before it, or barrels for the small portion'});
      let lotEnd,pressDOY=null,loads;
      if(red){
        // Interim kinetics: the ferment is simulated from the first fruit, with the cold soak program counted from that
        // fruit and every addition treated as present from the start. Later fruit actually has less skin contact; the
        // fill history is kept on the lot (picks, inoculation, additions after inoculation) for the fed-batch engine.
        const nT=Math.ceil(lt*q.mustGal*(1+q.headspace/100)/W.redTankGal-1e-9), r=lotSim(v,lt,pick,{...W,coolBTU:nT*W.coolBTU},simulate);
        if(r.stuck)flag('stuck'+wi+'|'+j,'method',{basis:'physical',constraint:'Fermentation kinetics',wine:v.name,lot:j,process:'Primary fermentation',what:`did not finish: ${Math.round(r.S)} g/L sugar left after ${Math.round(r.pressDay)} days`,consequences:'the lot holds its fermenter to the end of the simulated window and is pressed with sugar left, so that tank turns over late and the wine is exposed until it is restarted',remedies:'pick at lower Brix, add nutrients, warm the tank, or restart with an acclimated yeast'});
        if(r.mlStuck)flag('ml'+wi+'|'+j,'method',{basis:'physical',constraint:'Malolactic kinetics',wine:v.name,lot:j,process:'Malolactic fermentation',what:'did not finish within 300 days of pressing',consequences:'malic acid left in the wine going to barrel',remedies:'reinoculate, warm the wine, or check SO2 and pH'});
        if(r.barrelForced)flag('bf'+wi+'|'+j,'reschedule',{basis:'practice',constraint:'Cellar temperature',wine:v.name,lot:j,process:'Barrel down',what:'the cellar never reached the barrel-down temperature, so the lot went to barrel 300 days after pressing',consequences:'the lot tank is held all winter and spring',remedies:'heat the cellar or move to barrel on a date instead of a temperature'});
        const barrelDay=Math.min(r.barrelDay,bot-30), bg=r.barrelGal;loads=Math.ceil(lt/pressT-1e-9);lotEnd=r.pressEnd;pressDOY=pick+Math.floor(r.pressDay);
        seg('redTank',0,r.pressEnd,0,nT,{reserve:true,stageGal:lt*_W.MUST_GAL,tankGal:W.redTankGal*nT});
        F.picks.forEach(k=>seg('redTank',k.day-pick,r.pressEnd,k.tons*_W.MUST_GAL,0,{material:true}));
        ev('press',Math.floor(r.pressDay),r.gal,loads);
        if(v.barrel>0){seg('storage',r.pressEnd,barrelDay,r.gal);const out=barrelOut(barrelDay);seg('barrel',barrelDay,out,bg,Math.ceil(bg/BBL-1e-9));seg('storage',out,bl,bg)}
        else seg('storage',r.pressEnd,bl,r.gal);
        seg('blend',bl,bot,bg,null,{wine:wineGal,n});
      }else{
        // whole clusters are pressed the day they arrive; the juice settles, then is inoculated. Barrel-fermented wines go
        // to barrel once the last juice has settled; tank-fermented wines stay through the ferment (white kinetics are step 3).
        const juice=lt*_W.JUICE_GAL, settle=F.policy.settle;loads=0;
        F.picks.forEach(k=>{const ld=Math.ceil(k.delivery.tons/pressT-1e-9)*k.share;loads+=ld;ev('press',k.day-pick,k.tons*_W.JUICE_GAL,ld)});
        // barrel-fermented: each day's juice goes to barrel once it has settled, so no juice waits longer than the settle
        const barrelF=v.barrel>0, end=barrelF?lastRel+settle:Math.max(lastRel,F.inoc-pick)+19;lotEnd=end;
        if(settle>F.policy.holdWarn+1e-9)flag('hold'+wi,'method',{basis:'warning',constraint:'Juice holding',wine:v.name,process:'Settling',what:`juice settles ${Math.round(settle*24)} hours before inoculation, beyond the ${Math.round(F.policy.holdWarn*24)}-hour holding warning`,consequences:'longer cold holding than usual before inoculation',remedies:'shorten the settle, or confirm the longer hold'});
        seg('whiteTank',0,end,0,1,{reserve:true,stageGal:juice,tankGal:stdTank(G.whiteFermGal)});
        if(barrelF){let out=0;F.picks.forEach(k=>{const d=k.day-pick,g=k.tons*_W.JUICE_GAL;seg('whiteTank',d,d+settle,g,0,{material:true});const o=barrelOut(d+settle);out=Math.max(out,o);seg('barrel',d+settle,o,g*0.96,g*0.96/BBL)});seg('storage',out,bl,juice*0.94)}
        else{F.picks.forEach(k=>seg('whiteTank',k.day-pick,end,k.tons*_W.JUICE_GAL,0,{material:true}));seg('storage',end,bl,juice*0.96)}
        seg('blend',bl,bot,juice*0.94,null,{wine:wineGal,n});
      }
      const bg=cases*GAL_CASE, rel=release-p;
      seg('bottled',bot,rel,bg,cases/56);
      for(let k=0;k<12;k++){const f=1-(k+0.5)/12;seg('bottled',rel+k*MO,rel+(k+1)*MO,bg*f,cases*f/56)}
      // the lot's operational stages, one per vessel type it passes through: fermentor (its reservation), lot tank, barrel
      // (a white's daily barrel portions merged), blend. Labor, transfers, cleaning and gas read these, not the material records.
      const stages=[];S.filter(x=>!x.ev&&x.loc!=='bottled'&&!x.material).sort((x,y)=>x.a-y.a).forEach(x=>{const st=x.reserve?{...x,gal:x.stageGal}:{...x};const prev=stages[stages.length-1];
        if(prev&&prev.loc===st.loc&&st.loc==='barrel'&&st.a<=prev.b+1e-9){prev.a=Math.min(prev.a,st.a);prev.b=Math.max(prev.b,st.b);prev.gal+=st.gal;prev.units+=st.units}else stages.push(st)});
      lots.push({stages,wi,source:src.id,name:v.name,j,n,tons:lt,cases,wineCases:v.cases,pick,p,first:F.first,last:F.last,inoc:F.inoc,addUntil:F.addUntil,fill:F.fill,capTons:capT,
        afterInoc:F.picks.filter(k=>k.afterInoc).reduce((a,k)=>a+k.tons,0),picks:F.picks.map(k=>({day:k.day,tons:k.tons,share:k.share})),color:v.color,segs:S,bottle,release,
        bins:F.picks.reduce((a,k)=>a+_H.binsOf(k.delivery.tons,G).bins*k.share,0),loads,pressDOY,mustGal:lt*_W.MUST_GAL,end:lotEnd});
    });
  });
  // one account of processing demand; overtime is read from it, never recomputed
  const PD=_P.processingDemand(deliveries,lots,W,G);
  for(const x of PD.days){const names=[...x.wines,...x.pressWines].filter((a,i,arr)=>arr.indexOf(a)===i).join(' and ');
    if(x.lineOver>1e-9)exc.push(_X.exception('overtime',{basis:'practice',constraint:'Crush line hours',wine:names,process:'Crush',what:`${dayLabel(x.day)}: ${(x.redTons+x.whiteTons).toFixed(1)} tons need ${x.lineHrs.toFixed(1)} line hours against ${PD.window} in the crush window`,consequences:'fruit waits on the pad or the crew works a longer day',remedies:'add a crush shift, spread the picks, or sort faster'}));
    if(x.pressOver>1e-9)exc.push(_X.exception('overtime',{basis:'practice',constraint:'Press hours',wine:names,process:'Pressing',what:`${dayLabel(x.day)}: ${x.whiteLoads} white and ${x.redLoads} red press loads need ${(x.pressRunHrs+x.changeHrs).toFixed(1)} hours against ${PD.pressAvail} on one press`+(x.shared?', reds and whites sharing it':''),consequences:'fruit or drained pomace waits for the press',remedies:'spread the picks, a larger or second press, or a longer press day'}));
  }
  return {lots,pressT,short,exceptions:exc,winery:W,deliveries,demand:PD};
}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dayLabel(doy){const dt=new Date(Date.UTC(2027,0,1)+(doy-1)*864e5);return MONTHS[dt.getUTCMonth()]+' '+dt.getUTCDate()}
function flow(V,G,simulate){
  const {lots:base,pressT,short,exceptions,winery,deliveries,demand}=lotPlan(V,G,simulate), kk=Math.max(1,G.lotsPerTank||1);
  // enough overlaid vintages that every lot's whole life, from pick to the last case sold, lands in the normal-year window
  const maxEnd=Math.max(...base.flatMap(L=>L.segs.map(s=>s.b))), K=Math.max(3,Math.floor(maxEnd/365)), D=Math.max(365*4,Math.ceil((maxEnd+1)/365)*365);
  // one tank size per tank type: fermentors are the size chosen (lots are filled to fit them); lot and blending tanks
  // are the smallest standard size that holds the largest lot there
  const size={};['redTank','whiteTank','storage','blend'].forEach(k=>{const mx=Math.max(0,...base.flatMap(l=>l.segs.filter(s=>s.loc===k).map(s=>k==='blend'?Math.max(s.wine,s.gal*s.n):k==='storage'?s.gal*Math.min(kk,l.n):s.gal)));size[k]=k==='redTank'?Math.max(stdTank(G.redFermGal),stdTank(mx)):k==='whiteTank'?Math.max(stdTank(G.whiteFermGal),stdTank(mx)):stdTank(mx)});
  base.forEach(l=>l.segs.forEach(s=>{if(s.loc==='storage')s.units=1/Math.min(kk,l.n);else if(s.units==null)// a blend tank holds what actually arrives from barrel or tank, which until the lot ledger exists can exceed the finished volume
    s.units=s.loc==='blend'?Math.ceil(Math.max(s.wine,s.gal*s.n)/size.blend-1e-9)/s.n:Math.ceil(s.gal/size[s.loc]-1e-9)}));
  const mk=()=>{const o={};LOCS.forEach(([k])=>o[k]=new Float64Array(D));return o};
  const lanes=mk(),lanes0=mk(),ves=mk(),ves0=mk(),bWine=V.map(()=>new Float64Array(D)),grp={};
  for(let k=-K;k<=1;k++)base.forEach(L=>L.segs.forEach(s=>{
    const a=s.a+365*k,b=s.b+365*k;
    for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){
      const w=s.ev?1:Math.min(b,d+1)-Math.max(a,d);if(w<=0)continue;
      lanes[s.loc][d]+=s.gal*w;if(k===0)lanes0[s.loc][d]+=s.gal*w;
      // a vessel counts as in use on any day it holds wine, so on a transfer day both vessels count
      const u=s.loc==='bottled'?s.units*w:s.units;
      if(s.loc==='storage'){if(u){const g=grp[L.wi+'|'+k]||(grp[L.wi+'|'+k]={u:new Float64Array(D),gal:new Float64Array(D)});g.u[d]+=u;g.gal[d]+=s.gal}}else{ves[s.loc][d]+=u;if(k===0)ves0[s.loc][d]+=u;}
      if(s.loc==='barrel'&&u)bWine[L.wi][d]+=u;
    }
  }));
  // lots of one wine share lot tanks up to lotsPerTank, but never more wine than the tanks hold
  for(const key in grp){const g=grp[key],k0=key.endsWith('|0');for(let d=0;d<D;d++)if(g.u[d]>0){const n=Math.max(Math.ceil(g.u[d]-1e-9),Math.ceil(g.gal[d]/size.storage-1e-9));ves.storage[d]+=n;if(k0)ves0.storage[d]+=n}}
  const peak=(a)=>{let mx=0,at=0;for(let d=0;d<365;d++)if(a[d]>mx){mx=a[d];at=d}return{v:mx,at}};
  const need={};LOCS.forEach(([k])=>need[k]=peak(ves[k]));
  // VEN 235 floor: the must or juice actually in fermentors divided by a fermentor's working volume, as if it could be
  // split freely across tanks. A theoretical lower bound: real fills, policies and reservations can only need more.
  const working={redTank:size.redTank/1.2,whiteTank:size.whiteTank/1.1};
  const floorOf=k=>{let m=0;for(let d=0;d<365;d++)m=Math.max(m,lanes[k][d]/working[k]);return m};
  const fermFloor={redTank:size.redTank?floorOf('redTank'):0,whiteTank:size.whiteTank?floorOf('whiteTank'):0};
  const bPeak=bWine.map(a=>peak(a).v);
  const end=Math.max(...base.map(L=>L.release+365));
  const installedB=Math.ceil(need.barrel.v*(G.barrelSpare||1.05)-1e-9);let emptyBarrelDays=0;for(let d=0;d<365;d++)emptyBarrelDays+=Math.max(0,installedB-ves.barrel[d]);
  // installed barrels are the combined peak plus spares; each wine's share of them follows its own peak
  const sumB=bPeak.reduce((a,b)=>a+b,0), bStock=bPeak.map(b=>sumB?installedB*b/sumB:0);
  return {harvest:deliveries,deliveries,demand,crushHrsDay:demand.window,lots:base,lanes,lanes0,ves,ves0,size,working,need,fermFloor,bPeak,bStock,installedB,pressT,D,K,end,short,exceptions,winery,emptyBarrelDays};
}

// Daily cellar work and equipment time, built lot by lot from the same calendar as the flow.
const TASKS=[['crush','Crush days and sorting'],['press','Pressing'],['cap','Pumpovers and punchdowns'],['checks','Ferment checks and additions'],['moves','Transfers, racking, tank cleaning'],['barrel','Barrel work'],['bottling','Bottling'],['cases','Case goods and shipping'],['general','Rounds, cleaning, upkeep']];
const EQUIP=[['crushline','Sorting and destemming line'],['press','Press'],['mustpump','Must pump'],['popump','Pumpover pumps'],['xfer','Transfer pumps'],['washer','Barrel washer'],['bottler','Mobile bottling line'],['forklift','Forklift']];
function work(FL,V,G,sz){
  const D=FL.D,mk=K=>Object.fromEntries(K.map(([k])=>[k,new Float64Array(D)]));
  const T=mk(TASKS),T0=mk(TASKS),E=mk(EQUIP),E0=mk(EQUIP);
  const sortH=_W.SORT_LABOR[G.sort]??2.5,grav=G.buildTier==='gravity',GPH=3000,perHr=G.bottlePerDay/8;
  const put=(A,A0,key,d,h,k)=>{d=Math.floor(d);if(d<0||d>=D||!(h>0))return;A[key][d]+=h;if(k===0)A0[key][d]+=h};
  const spread=(A,A0,key,a,b,h,k)=>{if(!(h>0))return;for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){const w=Math.min(b,d+1)-Math.max(a,d);if(w>0){A[key][d]+=h*w;if(k===0)A0[key][d]+=h*w}}};
  for(let k=-(FL.K||3);k<=1;k++){const o=365*k;FL.lots.forEach(L=>{
    const S=L.segs,red=L.color==='red',p=L.p+o;
    const ST=L.stages||S;
    ST.filter(s=>s.loc==='redTank').forEach(s=>{spread(T,T0,'cap',s.a+o,s.b+o,2*G.capHrs,k);spread(E,E0,'popump',s.a+o,s.b+o,0.5,k);spread(T,T0,'checks',s.a+o,s.b+o,0.25,k)});
    if(!red)ST.filter(s=>s.loc==='whiteTank').forEach(s=>spread(T,T0,'checks',s.a+o,s.b+o,0.25,k));
    for(let i=1;i<ST.length;i++){const fr=ST[i-1],to=ST[i],d=to.a+o;
      put(E,E0,'xfer',d,grav&&to.loc==='barrel'?0.25:to.gal/GPH+0.5,k);put(T,T0,'moves',d,2+(fr.loc==='barrel'?0:2),k);
      if(to.loc==='barrel')put(T,T0,'barrel',d,to.units*0.1,k);
      if(fr.loc==='barrel'){put(E,E0,'washer',d,fr.units*0.15,k);put(T,T0,'barrel',d,fr.units*0.25,k)}}
    ST.filter(s=>s.loc==='barrel').forEach(s=>{spread(T,T0,'barrel',s.a+o,s.b+o,s.units*1.5/365,k);
      if(s.b-s.a>120){const m=(s.a+s.b)/2+o;put(T,T0,'barrel',m,s.units*0.4,k);put(E,E0,'xfer',m,s.units*BBL/GPH+1,k);put(E,E0,'washer',m,s.units*0.15,k)}});
    ST.filter(s=>s.loc==='storage').forEach(s=>spread(T,T0,'moves',s.a+o,s.b+o,s.units*20/365,k));
    const bot=L.bottle+o,bd=Math.max(1,Math.ceil(L.wineCases/G.bottlePerDay-1e-9)),lh=L.cases/perHr;
    spread(T,T0,'bottling',bot,bot+bd,(6*lh+4/L.n)/bd,k);spread(E,E0,'bottler',bot,bot+bd,lh/bd,k);spread(E,E0,'forklift',bot,bot+bd,L.cases/56*0.1/bd,k);
    put(T,T0,'moves',bot,2,k);
    spread(T,T0,'cases',L.release+o,L.release+o+365,L.cases*0.03/365,k);
  });
  // receiving, crush and press come from the one processing-demand table, the same numbers the overtime check reads
  for(const x of FL.demand.days){const d=x.day-AUG1+o;
    put(T,T0,'crush',d,G.crushCrew*x.receiveHrs+x.redTons*sortH+x.whiteTons*0.8,k);
    put(E,E0,'crushline',d,x.lineHrs>0?FL.demand.setup+x.lineHrs:0,k);put(E,E0,'forklift',d,x.bins*0.1,k);
    if(x.redTons>0&&!grav)put(E,E0,'mustpump',d,x.mustGal/GPH+1,k);
    put(E,E0,'press',d,x.pressHrs,k);if(x.pressHrs>0)put(T,T0,'press',d,2*(x.pressRunHrs+x.changeHrs)+2*(x.whiteLoads+x.redLoads)+FL.demand.clean,k)}
  }
  const inst=sz&&sz.barrels||0,active=new Uint8Array(D);
  for(let d=0;d<D;d++){active[d]=FL.lanes.redTank[d]+FL.lanes.whiteTank[d]>0?1:0;
    const empty=Math.max(0,inst-FL.ves.barrel[d])*0.1/42, g=(active[d]?6:G.generalHrs/7)+empty;
    T.general[d]+=g;T0.general[d]+=g}
  const units={crushline:1,press:1,mustpump:grav?0:1,popump:Math.max(1,Math.ceil((sz&&sz.nRed||4)/4)),xfer:(sz&&sz.allTons>60)?2:1,washer:inst?1:0,bottler:1,forklift:1};
  return {T,T0,E,E0,active,units};
}
if(typeof module!=='undefined')module.exports={flow,lotPlan,work,LOCS,UNIT,TASKS,EQUIP,AUG1,MO};
