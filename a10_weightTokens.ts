const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a10_weightTokensFiles/a10_dictionary.txt";
const postingFile = "./a10_weightTokensFiles/a10_posting.txt";
const logFile = "./a10_weightTokensFiles/a10_leo.txt";

const MIN_FREQUENCY = 3;
const STOP_LIST_PATH = "./a9_stopListFiles/StopList.txt";

// Tamaños de columna dividibles entre 80 bytes
// Diccionario: 4 columnas × 20 bytes = 80 bytes por fila
// Posting:     2 columnas × 40 bytes = 80 bytes por fila
const DICT_COL_WIDTH = 20;
const POSTING_COL_WIDTH = 40;

const pad = (str: string, width: number): string =>
  str.substring(0, width).padEnd(width, " ");

// Stop List

const loadStopList = async (path: string): Promise<Set<string>> => {
  const content = await readTextFile(path);
  return new Set(
    content.split("\n").map((w) => w.trim().toLowerCase()).filter((w) =>
      w.length > 0
    ),
  );
};

  // Filtros

const shouldRemove = (
  token: string,
  totalFreq: number,
  stopList: Set<string>,
): boolean =>
  stopList.has(token) || token.length <= 1 || totalFreq < MIN_FREQUENCY;

// Hash Table

interface HashEntry {
  key: string;
  docCount: number;
  postingPos: number;
  fileMap: Map<string, number>; // filename → frecuencia
}

class HashTable {
  private table: HashEntry[];
  private size: number;
  private used: number;
  private collisions: number;
  private lookups: number;

  constructor(estimatedSize: number) {
    this.size = estimatedSize * 3;
    this.used = 0;
    this.collisions = 0;
    this.lookups = 0;
    this.table = Array.from({ length: this.size }, () => ({
      key: "",
      docCount: 0,
      postingPos: -1,
      fileMap: new Map(),
    }));
  }

  private find(key: string): number {
    let sum = 0;
    for (let i = 0; i < key.length; i++) {
      sum = (sum * 19 + key.charCodeAt(i)) % this.size;
    }
    let index = sum % this.size;
    while (this.table[index].key !== "" && this.table[index].key !== key) {
      index = (index + 1) % this.size;
      this.collisions++;
    }
    return index;
  }

  insert(key: string, fileMap: Map<string, number>): void {
    const index = this.find(key);
    if (this.table[index].key === "") {
      this.table[index] = {
        key,
        docCount: fileMap.size,
        postingPos: -1,
        fileMap,
      };
      this.used++;
    }
  }

  getUsage() {
    return {
      used: this.used,
      collisions: this.collisions,
      lookups: this.lookups,
    };
  }

  getTableSize() {
    return this.size;
  }


  // Posting con tf.idf
  // totalTokensPerFile: filename, es el total de tokens en ese documento
  generatePostingRows(totalTokensPerFile: Map<string, number>): string[] {
    const header = pad("Nombre del archivo", POSTING_COL_WIDTH) +
      pad("tf.idf", POSTING_COL_WIDTH);
    const separator = "-".repeat(POSTING_COL_WIDTH * 2);
    const rows: string[] = [header, separator];

    let position = 0;
    for (const entry of this.table) {
      if (entry.key === "") continue;
      entry.postingPos = position;

      for (const [filename, freq] of entry.fileMap.entries()) {
        const totalTokens = totalTokensPerFile.get(filename) ?? 1;

        // tf.idf = (repeticiones * 100) / total de tokens en el documento
        const tfidf = ((freq * 100) / totalTokens).toFixed(4);

        rows.push(
          pad(filename, POSTING_COL_WIDTH) +
            pad(tfidf, POSTING_COL_WIDTH),
        );
      }

      position += entry.docCount;
    }
    return rows;
  }

  // Creación de Diccionario con ancho fijo
  generateDictionaryRows(): string[] {
    const header = pad("#", DICT_COL_WIDTH) +
      pad("Token", DICT_COL_WIDTH) +
      pad("Num. documentos", DICT_COL_WIDTH) +
      pad("Pos. posting", DICT_COL_WIDTH);
    const separator = "-".repeat(DICT_COL_WIDTH * 4);
    const rows: string[] = [header, separator];

    for (let i = 0; i < this.table.length; i++) {
      const e = this.table[i];
      if (e.key === "") {
        rows.push(
          pad(String(i), DICT_COL_WIDTH) +
            pad("(vacio)", DICT_COL_WIDTH) +
            pad("0", DICT_COL_WIDTH) +
            pad("-1", DICT_COL_WIDTH),
        );
      } else {
        rows.push(
          pad(String(i), DICT_COL_WIDTH) +
            pad(e.key, DICT_COL_WIDTH) +
            pad(String(e.docCount), DICT_COL_WIDTH) +
            pad(String(e.postingPos), DICT_COL_WIDTH),
        );
      }
    }
    return rows;
  }
}



// Ejecución de la tarea

const main = async () => {
  const totalStart = performance.now();
  const timings: { filename: string; durationMs: number }[] = [];
  const logLines: string[] = [];

  const stopList = await loadStopList(STOP_LIST_PATH);

  // Paso 1 — Leer archivos
  // rawStats:          token es   Map<filename, frecuencia>
  // totalTokensPerFile: filename es    total tokens (para tf.idf)
  const rawStats = new Map<string, Map<string, number>>();
  const totalTokensPerFile = new Map<string, number>();

  for await (const entry of readDir("./FilesSortedWords")) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;

    const fileStart = performance.now();

    const content = await readTextFile(`./FilesSortedWords/${entry.name}`);
    const words = content
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    // Total de tokens en este documento (antes de filtrar)
    totalTokensPerFile.set(entry.name, words.length);

    for (const word of words) {
      if (!rawStats.has(word)) rawStats.set(word, new Map());
      const fileMap = rawStats.get(word)!;
      fileMap.set(entry.name, (fileMap.get(entry.name) ?? 0) + 1);
    }

    timings.push({
      filename: entry.name,
      durationMs: performance.now() - fileStart,
    });
  }

  // Paso 2 — filtrar tokens
  let removedByStopList = 0;
  let removedByLength = 0;
  let removedByFrequency = 0;

  const filteredStats = new Map<string, Map<string, number>>();
  for (const [token, fileMap] of rawStats.entries()) {
    const totalFreq = [...fileMap.values()].reduce((a, b) => a + b, 0);
    if (shouldRemove(token, totalFreq, stopList)) {
      if (stopList.has(token)) removedByStopList++;
      else if (token.length <= 1) removedByLength++;
      else removedByFrequency++;
    } else {
      filteredStats.set(token, fileMap);
    }
  }

  // Paso 3 — Insertar en hash table
  const ht = new HashTable(filteredStats.size);
  for (const [token, fileMap] of filteredStats.entries()) {
    ht.insert(token, fileMap);
  }

  // Paso 4 — Generar archivos
  const postingRows = ht.generatePostingRows(totalTokensPerFile);
  const dictionaryRows = ht.generateDictionaryRows();
  const { used, collisions, lookups } = ht.getUsage();
  const totalMs = performance.now() - totalStart;

  // Paso 5 — Escribir archivos log
  logLines.push("LOG DE PROCESAMIENTO — a10_leo");
  logLines.push("=".repeat(60));
  logLines.push("");
  logLines.push("TIEMPOS POR ARCHIVO");
  logLines.push(pad("Archivo", 30) + pad("Tiempo (ms)", 20));
  logLines.push("-".repeat(50));
  for (const t of timings) {
    logLines.push(pad(t.filename, 30) + pad(t.durationMs.toFixed(3), 20));
  }

  logLines.push("");
  logLines.push("FILTROS APLICADOS");
  logLines.push(pad("Filtro", 25) + pad("Tokens eliminados", 20));
  logLines.push("-".repeat(45));
  logLines.push(pad("Stop list", 25) + pad(String(removedByStopList), 20));
  logLines.push(pad("Longitud <= 1", 25) + pad(String(removedByLength), 20));
  logLines.push(
    pad(`Frecuencia < ${MIN_FREQUENCY}`, 25) +
      pad(String(removedByFrequency), 20),
  );

  logLines.push("");
  logLines.push("RESUMEN GENERAL");
  logLines.push("-".repeat(45));
  logLines.push(pad("Tokens antes de filtrar:", 35) + rawStats.size);
  logLines.push(
    pad("Tokens eliminados:", 35) + (rawStats.size - filteredStats.size),
  );
  logLines.push(pad("Tokens en diccionario:", 35) + filteredStats.size);
  logLines.push(pad("Tamaño de la hash table:", 35) + ht.getTableSize());
  logLines.push(pad("Entradas usadas:", 35) + used);
  logLines.push(pad("Colisiones:", 35) + collisions);
  logLines.push(pad("Lookups:", 35) + lookups);
  logLines.push(
    pad("Factor de carga:", 35) + (used / ht.getTableSize()).toFixed(4),
  );
  logLines.push(
    pad("Bytes por fila (diccionario):", 35) + `${DICT_COL_WIDTH * 4} bytes`,
  );
  logLines.push(
    pad("Bytes por fila (posting):", 35) + `${POSTING_COL_WIDTH * 2} bytes`,
  );
  logLines.push(pad("Tiempo total:", 35) + `${totalMs.toFixed(3)} ms`);

  // Paso 6 — escribir archivos
  await Deno.mkdir("./a10_weightTokensFiles", { recursive: true });
  await writeTextFile(dictionaryFile, dictionaryRows.join("\n"));
  await writeTextFile(postingFile, postingRows.join("\n"));
  await writeTextFile(logFile, logLines.join("\n"));

  await writeTextFile("./a10_weightTokensFiles/tablesize.txt", String(ht.getTableSize()));
};

await main();
