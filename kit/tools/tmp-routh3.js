
function build(a,eps){ var n=a.length-1, rows=[], r0=[],r1=[];
  for(var i=0;i<=n;i+=2) r0.push(a[i]||0);
  for(var i=1;i<=n;i+=2) r1.push(a[i]||0);
  rows.push(r0); rows.push(r1);
  while(rows.length<=n){ var A=rows[rows.length-2], B=rows[rows.length-1].slice();
    if(eps!==undefined && Math.abs(B[0])<1e-14) B=B.map(function(v,k){return k===0?eps:v;});
    var L=Math.max(A.length,B.length), nr=[];
    for(var k=1;k<L;k++){ var a0=A[0], b0=B[0];
      nr.push(b0===0?0:(b0*(A[k]||0)-a0*(B[k]||0))/b0); }
    rows.push(nr); }
  return rows;
}
function aux(a){ var rows=build(a), n=a.length-1, az=-1;
  for(var i=0;i<rows.length;i++){ if(rows[i].every(function(v){return Math.abs(v)<1e-9;})){az=i;break;} }
  if(az<1) return null;
  var above=rows[az-1], deg=n-(az-1), A=[];
  for(var k=0;k<=deg;k++) A.push(k%2===0?(above[k/2]||0):0);
  return {row:az, above:above, A:A};
}
function cmul(x,y){return [x[0]*y[0]-x[1]*y[1],x[0]*y[1]+x[1]*y[0]];}
function csub(x,y){return [x[0]-y[0],x[1]-y[1]];}
function cdiv(x,y){var d=y[0]*y[0]+y[1]*y[1];return [(x[0]*y[0]+x[1]*y[1])/d,(x[1]*y[0]-x[0]*y[1])/d];}
function cabs(x){return Math.hypot(x[0],x[1]);}
function peval(a,z){var r=[0,0];for(var i=0;i<a.length;i++){r=cmul(r,z);r=[r[0]+a[i],r[1]];}return r;}
function roots(a){ var n=a.length-1,r=[],k,i,j;
  for(k=0;k<n;k++){var t=0.4+0.9*k;r.push([Math.cos(t),Math.sin(t)]);}
  for(i=0;i<900;i++) for(k=0;k<n;k++){ var num=peval(a,r[k]),den=[1,0];
    for(j=0;j<n;j++) if(j!==k) den=cmul(den,csub(r[k],r[j]));
    r[k]=csub(r[k],cdiv(num,den)); }
  return r; }
function nrhp(a){ return roots(a).filter(function(z){return z[0]>1e-7;}).length; }
function changes(col){ var s=0,p=0; col.forEach(function(v){ if(Math.abs(v)<1e-12)return; var q=v>0?1:-1; if(p&&q!==p)s++; p=q; }); return s; }

console.log('=== 特例② 整行全 0：辅助多项式（取**第一个**全 0 行）===');
[[1,1,4,4],[1,2,1,2],[1,3,3,3,2],[1,0,3,0,2]].forEach(function(a){
  var o=aux(a); if(!o){console.log('  a=['+a.join(',')+'] 无全0行');return;}
  console.log('  a=['+a.join(',')+']  第一个全0行 = row'+o.row+'；上一行 = ['+o.above.join(', ')+']');
  console.log('    A(s) 系数(高→低) = ['+o.A.join(', ')+']  →  ' + o.A.map(function(c,k){var d=o.A.length-1-k; return c + (d?('s^'+d):'');}).join(' + '));
  var ra=roots(o.A), syO=ra.every(function(x){return ra.some(function(y){return cabs([x[0]+y[0],x[1]+y[1]])<1e-6;});});
  console.log('    A 的根 = ' + ra.map(function(z){return z[0].toFixed(4)+(z[1]>=0?'+':'')+z[1].toFixed(4)+'j';}).join(', ') + '   关于原点对称 = ' + syO);
});

console.log('');
console.log('=== 特例① 第一列有 0 且该行还有非零元：ε 法 vs 真实右半平面根数 ===');
var found=0, tested=0;
outer:
for(var b=1;b<=3;b++) for(var c=1;c<=4;c++) for(var d=1;d<=6;d++) for(var e=1;e<=4;e++){
  var a=[1,b,c,d,e,1];
  var rows=build(a);
  // 找第一个「第一列是0但该行还有非零元」的行
  var hit=-1;
  for(var i=2;i<rows.length;i++){
    var r=rows[i], nz=r.filter(function(v){return Math.abs(v)>1e-9;}).length;
    if(Math.abs(r[0])<1e-12 && nz>0){ hit=i; break; }
  }
  if(hit<0) continue;
  tested++;
  var naive=changes(rows.map(function(r){return r[0];}));
  var epsCounts=[1e-3,1e-6,1e-9,1e-12].map(function(ep){ return changes(build(a,ep).map(function(r){return r[0];})); });
  var trueN=nrhp(a);
  if(found<6){ found++;
    console.log('  a=['+a.join(',')+']  第一列0在第 row'+hit+' 行, 该行=['+rows[hit].join(', ')+']');
    console.log('    跳过0的朴素符号变化='+naive+'   ε法(ε=1e-3..1e-12)='+epsCounts.join('/')+'   真实 RHP 根数='+trueN);
  }
}
console.log('  本轮共找到 ' + tested + ' 个样例');
