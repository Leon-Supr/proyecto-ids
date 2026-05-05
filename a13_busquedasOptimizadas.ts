// Uso: deno run --allow-read --allow-write a13_busquedasOptimizadas.ts <token1> [token2] ... [--no-filter]
// Ejemplo: deno run --allow-read --allow-write a13_busquedasOptimizadas.ts dog cat

const args     = Deno.args.filter((a) => !a.startsWith("--"));
const noFilter = Deno.args.includes("--no-filter");

if (args.length === 0) {
  console.log("Uso: deno run --allow-read --allow-write a13_busquedasOptimizadas.ts <token1> [token2] ...");
  Deno.exit(1);
}

const BASE      = noFilter ? "./a12_noFilter" : "./a11_queryFiles";
const DICT_FILE = "./a10_weightTokensFiles/a10_dictionary.txt";
const POST_FILE = `${BASE}/a11_posting.txt`;
const DOCS_FILE = `${BASE}/a11_documents.txt`;
const LOG_FILE  = "./a13_queryFiles/a13_leo.txt";

const DICT_COL = 20;
const POST_COL = 20;
const DOCS_COL = 40;
const HEADER   = 2;

const decoder = new TextDecoder();

// ─── Tabla de offsets reales ───────────────────────────────────────────────────
// Escanea el archivo en chunks buscando \n para saber el byte exacto
// donde empieza cada línea. Resuelve el problema de tokens con caracteres
// no-ASCII que hacen que las filas tengan más bytes de los asumidos.

const buildOffsetTable = async (filePath: string): Promise<number[]> => {
  const file    = await Deno.open(filePath, { read: true });
  const offsets = [0];
  const buf     = new Uint8Array(65536);
  let bytePos   = 0;

  try {
    while (true) {
      const n = await file.read(buf);
      if (n === null) break;
      for (let i = 0; i < n; i++) {
        if (buf[i] === 0x0a) {
          offsets.push(bytePos + i + 1);
        }
      }
      bytePos += n;
    }
  } finally {
    file.close();
  }

  return offsets;
};

// ─── Lectura directa usando offset real ───────────────────────────────────────

const readLineAtOffset = async (
  file: Deno.FsFile,
  offset: number,
  maxBytes: number,
): Promise<string> => {
  await file.seek(offset, Deno.SeekMode.Start);
  const buf     = new Uint8Array(maxBytes);
  await file.read(buf);
  const newline = buf.indexOf(0x0a);
  const end     = newline === -1 ? maxBytes : newline;
  return decoder.decode(buf.subarray(0, end));
};

// ─── Hash: misma fórmula base 19 del proyecto ─────────────────────────────────

const hashToken = (token: string, tableSize: number): number => {
  let sum = 0;
  for (let i = 0; i < token.length; i++)
    sum = (sum * 19 + token.charCodeAt(i)) % tableSize;
  return sum % tableSize;
};

// ─── Búsqueda en diccionario con offsets reales ───────────────────────────────

const searchInDictionary = async (
  token: string,
  tableSize: number,
  offsets: number[],
): Promise<{ docCount: number; postingPos: number } | null> => {
  const file = await Deno.open(DICT_FILE, { read: true });
  let index   = hashToken(token, tableSize);

  try {
    for (let probe = 0; probe < tableSize; probe++) {
      const lineNum = HEADER + index;
      if (lineNum >= offsets.length) break;

      const line        = await readLineAtOffset(file, offsets[lineNum], DICT_COL * 4 + 2);
      const tokenInLine = line.substring(DICT_COL, DICT_COL * 2).trim();

      if (tokenInLine === "(vacio)" || tokenInLine === "") return null;
      if (tokenInLine === token) {
        const docCount   = parseInt(line.substring(DICT_COL * 2, DICT_COL * 3).trim());
        const postingPos = parseInt(line.substring(DICT_COL * 3).trim());
        return { docCount, postingPos };
      }

      index = (index + 1) % tableSize;
    }
  } finally {
    file.close();
  }

  return null;
};

// ─── Lectura del posting con offsets reales ───────────────────────────────────

const readPostingDirect = async (
  postingPos: number,
  docCount: number,
  offsets: number[],
): Promise<{ docId: number; tfidf: number }[]> => {
  const file    = await Deno.open(POST_FILE, { read: true });
  const results: { docId: number; tfidf: number }[] = [];

  try {
    for (let i = 0; i < docCount; i++) {
      const lineNum = HEADER + postingPos + i;
      if (lineNum >= offsets.length) break;
      const line  = await readLineAtOffset(file, offsets[lineNum], POST_COL * 2 + 2);
      const docId = parseInt(line.substring(0, POST_COL).trim());
      const tfidf = parseFloat(line.substring(POST_COL).trim());
      if (!isNaN(docId)) results.push({ docId, tfidf });
    }
  } finally {
    file.close();
  }

  return results;
};

// ─── Lectura de documentos con offsets reales ─────────────────────────────────

const getFilenameById = async (
  docId: number,
  offsets: number[],
): Promise<string> => {
  const file    = await Deno.open(DOCS_FILE, { read: true });
  const lineNum = HEADER + docId;
  try {
    if (lineNum >= offsets.length) return `ID:${docId}`;
    const line     = await readLineAtOffset(file, offsets[lineNum], DOCS_COL * 2 + 2);
    const filename = line.substring(DOCS_COL).trim();
    return filename || `ID:${docId}`;
  } finally {
    file.close();
  }
};

// ─── Principal ─────────────────────────────────────────────────────────────────

const main = async () => {
  const totalStart = performance.now();
  const logLines: string[] = [];
  const version   = noFilter ? "sin stop list" : "con stop list";

  const tableSize = parseInt(
    await Deno.readTextFile("./a10_weightTokensFiles/tablesize.txt"),
  );

  // Construir tablas de offsets para cada archivo (una sola pasada cada uno)
  const [dictOffsets, postOffsets, docsOffsets] = await Promise.all([
    buildOffsetTable(DICT_FILE),
    buildOffsetTable(POST_FILE),
    buildOffsetTable(DOCS_FILE),
  ]);

  const scoreMap  = new Map<number, number>();
  const searchLog: string[] = [];

  console.log(`\n🔍 Búsqueda: "${args.join(" ")}" (${version})\n`);

  for (const rawToken of args) {
    const token      = rawToken.toLowerCase().trim();
    const tokenStart = performance.now();
    const dictResult = await searchInDictionary(token, tableSize, dictOffsets);
    const tokenMs    = performance.now() - tokenStart;

    if (!dictResult) {
      console.log(`  ⚠️  "${token}" no encontrado en el diccionario`);
      searchLog.push(`Token: ${token} | No encontrado | ${tokenMs.toFixed(3)} ms`);
      continue;
    }

    const { docCount, postingPos } = dictResult;
    const entries = await readPostingDirect(postingPos, docCount, postOffsets);

    for (const { docId, tfidf } of entries)
      scoreMap.set(docId, (scoreMap.get(docId) ?? 0) + tfidf);

    searchLog.push(`Token: ${token} | Docs: ${docCount} | Pos: ${postingPos} | ${tokenMs.toFixed(3)} ms`);
  }

  const top10 = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`📄 Top ${top10.length} documentos:\n`);
  const resultLines: string[] = [];

  for (let i = 0; i < top10.length; i++) {
    const [docId, score] = top10[i];
    const filename = await getFilenameById(docId, docsOffsets);
    const line     = `  ${i + 1}. ${filename}  (score: ${score.toFixed(4)})`;
    console.log(line);
    resultLines.push(line.trim());
  }

  const totalMs = performance.now() - totalStart;

  // ─── Log ──────────────────────────────────────────────────────────────────────
  logLines.push("LOG DE BÚSQUEDA — a13_leo");
  logLines.push("=".repeat(55));
  logLines.push(`Query    : ${args.join(" ")}`);
  logLines.push(`Versión  : ${version}`);
  logLines.push(`Fecha    : ${new Date().toLocaleString("es-MX")}`);
  logLines.push("");
  logLines.push("BÚSQUEDA POR TOKEN");
  logLines.push("-".repeat(55));
  for (const e of searchLog) logLines.push(e);
  logLines.push("");
  logLines.push("TOP 10 RESULTADOS");
  logLines.push("-".repeat(55));
  for (const l of resultLines) logLines.push(l);
  logLines.push("");
  logLines.push(`Tiempo total: ${totalMs.toFixed(3)} ms`);

  await Deno.mkdir("./a13_queryFiles", { recursive: true });

  try {
    const existing = await Deno.readTextFile(LOG_FILE);
    await Deno.writeTextFile(LOG_FILE, existing + "\n\n" + logLines.join("\n"));
  } catch {
    await Deno.writeTextFile(LOG_FILE, logLines.join("\n"));
  }

  console.log(`\n⏱  Tiempo total: ${totalMs.toFixed(3)} ms`);
  console.log(`✅ Log: ${LOG_FILE}`);
};

await main();