// Line rate in tons per hour that each sorting method allows; shared with winery.js.
const SORT_RATE={none:1e9,hand:2.5,optical:6};
const YEAST={robust:{Yxn:0.022,kT:0.06,heat:30,f0:1},lowN:{Yxn:0.032,kT:0.06,heat:30,f0:1},cool:{Yxn:0.022,kT:0.045,heat:27,f0:1.12}};
function cellarF(p,day){ // day = days from Jan 1, unheated cellar follows a seasonal cosine, coldest ~Jan 20
  const mid=(p.winterF+p.summerF)/2, amp=(p.summerF-p.winterF)/2;
  return mid-amp*Math.cos(2*Math.PI*(day-20)/365);
}
function simulate(p){
  const Y=YEAST[p.yeast]||YEAST.robust;
  const dt=1/48,cp=3.8,JUICE=0.8,HEAT=0.6,F2C=f=>(f-32)*5/9,C2F=c=>c*9/5+32;
  const isBin=p.vessel==='bin', M=(isBin?0.9:p.tons)*907;
  const UA=isBin?0.06:0.012*Math.pow(p.tons,2/3), cool=isBin?0:p.coolBTU/3412;
  const Tset=F2C(p.setF),swing=p.swingF*5/9;
  let S=p.brix*10,N=p.yan,X=0,E=0,inoc=p.soakDays,dapDone=false;
  let T=p.soakDays>0?F2C(p.soakF):F2C(p.fruitF);
  const out=[];let dry=null,peakT=-99,peakQ=0,peakCool=0,coolKWh=0;
  // LAB for co-inoculation
  const LABK=3e7; let lab=0, mal=p.malic;
  let tEnd=0;
  for(let i=0;;i++){
    const t=i*dt; if(t>p.soakDays+45)break; tEnd=t;
    const Tamb=F2C(p.ambF)+swing/2*Math.sin(2*Math.PI*(t-0.375));
    let dS=0;
    if(t>=inoc){
      if(X===0)X=0.2;
      if(!dapDone&&p.dapDay>=0&&t>=inoc+p.dapDay){N+=p.dapAmt;dapDone=true}
      const f=Y.f0*Math.exp(Y.kT*(T-25));
      const a=Math.min(1,(t-inoc)/1.2), lagF=a*a*(3-2*a); // rehydration and acclimation
      const mu=2.4*lagF*f*N/(25+N)*Math.max(0,1-E/60), dX=mu*X*dt;
      N=Math.max(0,N-dX/Y.Yxn);
      const kd=0.008+0.0002*E*Math.exp(0.3*(T-Y.heat+3));
      X=Math.max(0,X+dX-kd*X*dt);
      const Emax=150-4*Math.max(0,T-Y.heat);
      const q=14*f*S/(3+S)*Math.max(0,1-E/Emax);
      dS=Math.min(S,q*X*dt); S-=dS; E+=0.47*dS;
      if(p.ml==='co'&&t>=inoc+1){ if(lab===0)lab=1e6; const r=labRate(C2F(T),E/7.89); lab+=r.g*lab*(1-lab/LABK)*dt*(S>20?0.4:1); mal=Math.max(0,mal-r.c*lab*mal/(0.2+mal)*dt); }
    }
    const Qgen=dS/dt*JUICE*M*HEAT/86400; let Qcool=0;
    if(t>=inoc){
      if(cool>0){const need=Qgen+M*cp*(T-Tset)/(0.25*86400);Qcool=Math.min(cool,Math.max(0,need))}
      T+=(Qgen-Qcool-UA*(T-Tamb))*dt*86400/(M*cp);
      peakT=Math.max(peakT,T);peakQ=Math.max(peakQ,Qgen);peakCool=Math.max(peakCool,Qcool);coolKWh+=Qcool*dt*24;
    }
    if(dry===null&&t>inoc&&S<2)dry=t;
    if(i%4===0)out.push({t,s:S,b:S/10-0.0165*E,T:C2F(T),A:C2F(Tamb),Q:Qgen*3412,C:Qcool*3412,m:mal});
    if(dry!==null&&t>dry+p.emDays+1)break;
  }
  const abv=E/7.89;
  const r={out,dry,inoc,peakTF:C2F(peakT),peakQ:peakQ*3412,peakCool:peakCool*3412,cap:cool*3412,coolKWh,S,abv,brixEnd:S/10-0.0165*E,isBin};
  const tons=p.tons;
  const sortRate=SORT_RATE[p.sort]??1e9;
  const crushRate=Math.min(p.crushRate,sortRate), crushHrs=tons/crushRate+p.setupHrs;
  const bins=Math.ceil(tons/p.binTons-1e-9);
  const mustGal=tons*p.mustGal, tankGal=mustGal*(1+p.headspace/100);
  Object.assign(r,{crushHrs,crushRate,bins,mustGal,tankGal});
  // A ferment that has not finished by the end of the window is reported as stuck, not hidden: the wine stays in its
  // fermenter to the end of the window and is then pressed with its sugar still in it.
  r.stuck=dry===null;
  // ---- crush, drain and press, volumes ----
  const loads=Math.ceil(tons/p.pressLoad-1e-9), pressHrs=loads*p.pressCycle;
  const pressDay=r.stuck?tEnd:dry+p.emDays, pressEnd=pressDay+pressHrs/24;
  const freeGal=tons*p.freeRun, pressGal=tons*p.pressGal, gal=freeGal+pressGal, pomace=tons*0.17;
  const barrelGal=gal*(1-p.leesPct/100);
  const barrels=p.pressHandling==='separate'?Math.ceil(freeGal*(1-p.leesPct/100)/59.4-1e-9)+Math.ceil(pressGal*(1-p.leesPct/100)/59.4-1e-9):Math.ceil(barrelGal/59.4-1e-9);
  // ---- malolactic, daily steps from press ----
  const startDOY=p.harvestDOY+pressEnd;
  let L=p.ml==='co'?lab:(p.ml==='seq'?1e6:1e3), m=mal;
  const ml=[];let mlDone=m<0.1?pressEnd:null, barrelDay=null, unprot=dry? (pressEnd-dry):0, warmUnprot=0;
  for(let d=0;d<300;d++){
    const day=pressEnd+d, doy=startDOY+d;
    const cel=cellarF(p,doy);
    const inBarrel=barrelDay!==null;
    let wT=cel;
    if(!inBarrel&&p.mlHeat) wT=Math.max(cel,p.mlHeatF);
    if(mlDone===null){
      const rr=labRate(wT,abv);
      L+=rr.g*L*(1-L/LABK); m=Math.max(0,m-rr.c*L*m/(0.2+m));
      if(m<0.1)mlDone=day;
      unprot+=1; if(wT>=60)warmUnprot+=1;
    }
    if(barrelDay===null){
      if(p.barrelRule==='afterML'){ if(mlDone!==null&&day>=Math.max(mlDone,pressEnd)+p.settleDays)barrelDay=day; }
      else if(doy>365+30&&cel>=p.barrelF)barrelDay=day;
    }
    if(barrelDay===null&&d>=299){barrelDay=day;r.barrelForced=true}
    ml.push({t:day,m,w:wT,c:cel});
    if(mlDone!==null&&barrelDay!==null&&day>Math.max(mlDone,barrelDay)+20)break;
  }
  r.mlStuck=mlDone===null;
  Object.assign(r,{pressDay,pressEnd,pressHrs,loads,gal,barrels,ml,mlDone,barrelDay,unprot,warmUnprot,crushHrs,crushRate,bins,mustGal,tankGal,freeGal,pressGal,pomace,barrelGal});
  return r;
}
function labRate(wF,abv){
  const T=(wF-32)*5/9;
  const tf=Math.exp(0.15*(T-20))/(1+Math.exp(-(T-13)/1.2));
  const ef=Math.min(1,Math.max(0.3,1-(abv-13)/8));
  return {g:0.45*tf*ef,c:0.17/3e7*tf*ef};
}
if(typeof module!=='undefined')module.exports={simulate,cellarF,SORT_RATE};
