
export function stripDiacritics(str){
  return (str||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
export function normKey(str){
  let s = stripDiacritics(String(str||"").trim().toLowerCase());
  s = s.replace(/[\s\-\/\.]+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/_+/g,"_");
  return s;
}
export function splitCSVLine(line, sep){
  // split while respecting simple quoted fields
  const out = [];
  let cur = "", inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === sep && !inQ){
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s=> s.replace(/^\s+|\s+$/g,""));
}
export function parseCSVSmart(text){
  const t = String(text||"");
  const useSemi = t.includes(";") && (!t.includes(",") || (t.split("\n",1)[0].split(";").length > t.split("\n",1)[0].split(",").length));
  const sep = useSemi ? ";" : ",";
  const lines = t.split(/\r?\n/).filter(l=>l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headerCells = splitCSVLine(lines.shift(), sep);
  const headers = headerCells.map(h=> normKey(h));
  const rows = lines.map(line => {
    const cells = splitCSVLine(line, sep).map(s=> s.replace(/^"|"$/g,"").replace(/""/g,'"'));
    const o = {};
    headers.forEach((h,i)=> o[h] = (i<cells.length ? cells[i] : ""));
    return o;
  });
  return { headers, rows };
}
