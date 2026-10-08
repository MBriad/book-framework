
function build(a){ var n=a.length-1, rows=[], r0=[],r1=[];
  for(var i=0;i<=n;i+=2) r0.push(a[i]||0);
  for(var i=1;i<=n;i+=2) r1.push(a[i]||0);
  rows.push(r0); rows.push(r1);
  while(rows.length<=n){ var A=rows[rows.length-2], B=rows[rows.length-1];
    var L=Math.max(A.length,B.length), nr=[];
    for(var k=1;k<L;k++){ var a0=A[0], b0=B[0];
      nr.push(b0===0?0:(b0*(A[k]||0)-a0*(B[k]||0))/b0); }
    rows.push(nr); }
  return rows;
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
function sym(rs,tol){ tol=tol||1e-5;
  var o=rs.every(function(x){return rs.some(function(y){return cabs([x[0]+y[0],x[1]+y[1]])<tol;});});
  var im=rs.every(function(x){return rs.some(function(y){return Math.abs(x[0]+y[0])<tol&&Math.abs(x[1]-y[1])<tol;});});
  return {origin:o, imaxis:im}; }
function signChanges(col){ var s=0,p=0; col.forEach(function(v){ if(Math.abs(v)<1e-12) return; var q=v>0?1:-1; if(p&&q!==p) s++; p=q; }); return s; }

console.log('--- A) 符号变化数 == 右半平面根数？（书上例 3.32）---');
var ex=[1,4,3,2,1,4,4], rex=roots(ex);
var colEx=build(ex).map(function(r){return r[0];});
console.log('  第一列 = [' + colEx.map(function(v){return v.toFixed(4);}).join(', ') + ']');
console.log('  符号变化 = ' + signChanges(colEx) + '，实际 Re>0 的根数 = ' + rex.filter(function(z){return z[0]>1e-9;}).length + '  (书上说 2)');

console.log('');
console.log('--- B) 整行全 0：辅助多项式 A(s) 的根是否关于原点对称 ---');
[[1,1,4,4],[1,2,1,2],[1,3,3,3,2]].forEach(function(a){
  var rows=build(a), n=a.length-1, az=-1;
  rows.forEach(function(r,i){ if(r.every(function(v){return Math.abs(v)<1e-9;})) az=i; });
  var above=rows[az-1];
  var deg=n-(az-1);
  var A=[];
  for(var k=0;k<=deg;k++) A.push(k%2===0?(above[k/2]||0):0);
  console.log('  a=['+a.join(',')+']  全0行 = row'+az+'（对应 s^'+(n-az)+'）');
  console.log('    上一行 row'+(az-1)+' = [' + above.join(', ') + ']  →  A(s) = ' + A.join(' s^? '));
  var ra=roots(A.slice(0,A.length));
  console.log('    A(s) 的根 = ' + ra.map(function(z){return z[0].toFixed(3)+(z[1]>=0?'+':'')+z[1].toFixed(3)+'j';}).join(', '));
  var sy=sym(ra);
  console.log('    A 的根: 关于原点对称 = ' + sy.origin + ' ; 关于 jω 轴对称 = ' + sy.imaxis);
});

console.log('');
console.log('--- C) 第一列出现 0 且该行还有非零元：构造 s^5+s^4+2s^3+2s^2+5s+1 ---');
var c1=[1,1,2,2,5,1], rc1=roots(c1);
build(c1).forEach(function(r,i){ console.log('  row'+i+' (s^'+(c1.length-1-i)+'): [' + r.map(function(v){return Math.abs(v)<1e-9?'0':v.toFixed(4);}).join(', ') + ']'); });
console.log('  根 = ' + rc1.map(function(z){return z[0].toFixed(4)+(z[1]>=0?'+':'')+z[1].toFixed(4)+'j';}).join(', '));
var sc1=sym(rc1);
console.log('  全体根: 关于原点对称 = ' + sc1.origin + ' ; 关于 jω 轴对称 = ' + sc1.imaxis);
