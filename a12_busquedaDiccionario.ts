// Uso: deno run --allow-read --allow-write a12_retrieve.ts <palabra> [--no-filter]
// Ejemplo: deno run --allow-read --allow-write a12_retrieve.ts gato
// Con --no-filter usa los archivos sin stop list

const { readTextFile, writeTextFile } = Deno;

const DICT_COL_WIDTH    = 20;
const POSTING_COL_WIDTH = 20;
const DOCS_COL_WIDTH    = 40;

const pad = (str: string, width: number) =>
  str.substring(0, width).padEnd(width, " ");

// ─── Argumentos ────────────────────────────────────────────────────────────────

const args      = Deno.args;
const query     = args[0]?.toLowerCase().trim();
const noFilter  = args.includes("--no-filter");

if (!query) {
  console.log("Uso: deno run --allow-read --allow-write a12_retrieve.ts <palabra> [--no-filter]");
  Deno.exit(1);
}

// ─── Rutas según versión ───────────────────────────────────────────────────────

const BASE = noFilter ? "./a12_noFilter" : "./a11_queryFiles";

const dictionaryFile = `${BASE}/a11_dictionary.txt`;
const postingFile    = `${BASE}/a11_posting.txt`;
const documentsFile  = `${BASE}/a11_documents.txt`;
const logFile        = `./a12_queryFiles/a12_leo.txt`;

// ─── Parsers de archivos de ancho fijo ────────────────────────────────────────

// Lee el diccionario y regresa la entrada del token buscado, o null si no existe
const searchDictionary = async (
  token: string,
): Promise<{ docCount: number; postingPos: number } | null> => {
  const content = await readTextFile(dictionaryFile);
  const lines   = content.split("\n").slice(2); // salta encabezado y separador

  for (const line of lines) {
    // Columnas: # (20) | Token (20) | Núm. docs (20) | Pos. posting (20)
    const tokenInLine = line.substring(DICT_COL_WIDTH, DICT_COL_WIDTH * 2).trim();
    if (tokenInLine === token) {
      const docCount   = parseInt(line.substring(DICT_COL_WIDTH * 2, DICT_COL_WIDTH * 3).trim());
      const postingPos = parseInt(line.substring(DICT_COL_WIDTH * 3).trim());
      return { docCount, postingPos };
    }
  }
  return null;
};

// Lee el posting desde postingPos y devuelve docCount entradas
const readPosting = async (
  postingPos: number,
  docCount: number,
): Promise<{ docId: number; tfidf: number }[]> => {
  const content = await readTextFile(postingFile);
  const lines   = content.split("\n").slice(2); // salta encabezado y separador

  const results: { docId: number; tfidf: number }[] = [];

  for (let i = postingPos; i < postingPos + docCount && i < lines.length; i++) {
    const line  = lines[i];
    const docId = parseInt(line.substring(0, POSTING_COL_WIDTH).trim());
    const tfidf = parseFloat(line.substring(POSTING_COL_WIDTH).trim());
    if (!isNaN(docId)) results.push({ docId, tfidf });
  }

  return results;
};

// Lee el archivo de documentos y regresa un Map de ID → filename
const loadDocuments = async (): Promise<Map<number, string>> => {
  const content = await readTextFile(documentsFile);
  const lines   = content.split("\n").slice(2);
  const map     = new Map<number, string>();

  for (const line of lines) {
    const id       = parseInt(line.substring(0, DOCS_COL_WIDTH).trim());
    const filename = line.substring(DOCS_COL_WIDTH).trim();
    if (!isNaN(id) && filename) map.set(id, filename);
  }

  return map;
};

// ─── Principal ─────────────────────────────────────────────────────────────────

const main = async () => {
  const totalStart = performance.now();
  const logLines: string[] = [];
  const version = noFilter ? "sin stop list" : "con stop list";

  console.log(`\n🔍 Buscando: "${query}" (${version})\n`);

  // Paso 1 — Buscar el token en el diccionario
  const searchStart  = performance.now();
  const dictResult   = await searchDictionary(query);
  const searchTimeMs = performance.now() - searchStart;

  if (!dictResult) {
    console.log(`❌ La palabra "${query}" no se encuentra en el diccionario.`);

    // Log de búsqueda fallida
    logLines.push("LOG DE BÚSQUEDA — a12_leo");
    logLines.push("=".repeat(50));
    logLines.push(pad("Query:", 25)          + query);
    logLines.push(pad("Versión:", 25)        + version);
    logLines.push(pad("Resultado:", 25)      + "No encontrado");
    logLines.push(pad("Tiempo búsqueda:", 25) + `${searchTimeMs.toFixed(3)} ms`);
    logLines.push(pad("Tiempo total:", 25)   + `${(performance.now() - totalStart).toFixed(3)} ms`);

    await Deno.mkdir("./a12_queryFiles", { recursive: true });
    await writeTextFile(logFile, logLines.join("\n"));
    Deno.exit(0);
  }

  const { docCount, postingPos } = dictResult;

  // Paso 2 — Leer las entradas del posting
  const postingResults = await readPosting(postingPos, docCount);

  // Paso 3 — Cargar el archivo de documentos para resolver IDs a nombres
  const documents = await loadDocuments();

  // Paso 4 — Imprimir resultados ordenados por tf.idf descendente
  const sorted = postingResults.sort((a, b) => b.tfidf - a.tfidf);

  console.log(`📄 Documentos que contienen "${query}" (${docCount} resultado${docCount !== 1 ? "s" : ""}):\n`);
  for (let i = 0; i < sorted.length; i++) {
    const filename = documents.get(sorted[i].docId) ?? `ID:${sorted[i].docId}`;
    console.log(`  ${i + 1}. ${filename}  (tf.idf: ${sorted[i].tfidf.toFixed(4)})`);
  }

  const totalMs = performance.now() - totalStart;

  // ─── Log ────────────────────────────────────────────────────────────────────
  logLines.push("LOG DE BÚSQUEDA — a12_leo");
  logLines.push("=".repeat(50));
  logLines.push(pad("Query:", 25)               + query);
  logLines.push(pad("Versión:", 25)             + version);
  logLines.push(pad("Documentos encontrados:", 25) + docCount);
  logLines.push(pad("Posición en posting:", 25) + postingPos);
  logLines.push(pad("Tiempo de búsqueda:", 25)  + `${searchTimeMs.toFixed(3)} ms`);
  logLines.push(pad("Tiempo total:", 25)        + `${totalMs.toFixed(3)} ms`);
  logLines.push("");
  logLines.push("RESULTADOS");
  logLines.push("-".repeat(50));
  for (let i = 0; i < sorted.length; i++) {
    const filename = documents.get(sorted[i].docId) ?? `ID:${sorted[i].docId}`;
    logLines.push(`${i + 1}. ${filename} (tf.idf: ${sorted[i].tfidf.toFixed(4)})`);
  }

  await Deno.mkdir("./a12_queryFiles", { recursive: true });
  await writeTextFile(logFile, logLines.join("\n"));

  console.log(`\n⏱  Búsqueda: ${searchTimeMs.toFixed(3)} ms | Total: ${totalMs.toFixed(3)} ms`);
};

await main();