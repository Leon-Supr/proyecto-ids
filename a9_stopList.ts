const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a9_stopListFiles/a9_dictionary.md";
const postingFile    = "./a9_stopListFiles/a9_posting.txt";
const logFile        = "./a9_stopListFiles/a9_leo.txt";

const MIN_FREQUENCY = 3; // Criterio: eliminar tokens con menos de 3 repeticiones totales

// Stop List - Palabras sin relevancia

const loadStopList = async (path: string): Promise<Set<string>> => {
  const content = await readTextFile(path);
  const words = content
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  return new Set(words);
};

// Filtros

const shouldRemove = ( // Aclara si quitarlos y da la razón de por qué
  token: string,
  totalFreq: number,
  stopList: Set<string>,
): { remove: boolean; reason: string } => {
  if (stopList.has(token))
    return { remove: true, reason: "stop list" };
  if (token.length <= 1)
    return { remove: true, reason: "longitud <= 1" };
  if (totalFreq < MIN_FREQUENCY)
    return { remove: true, reason: `frecuencia baja (${totalFreq} < ${MIN_FREQUENCY})` };
  return { remove: false, reason: "" };
};

// Misma estrucutura de HashTable que la actividad 8

interface HashEntry {
  key:        string;
  docCount:   number;
  postingPos: number;
  fileMap:    Map<string, number>;
}

class HashTable {
  private table:      HashEntry[];
  private size:       number;
  private used:       number;
  private collisions: number;
  private lookups:    number;

  constructor(estimatedSize: number) {
    this.size       = estimatedSize * 3;
    this.used       = 0;
    this.collisions = 0;
    this.lookups    = 0;
    this.table      = Array.from({ length: this.size }, () => ({
      key: "", docCount: 0, postingPos: -1, fileMap: new Map(),
    }));
  }

  private find(key: string): number {
    let sum = 0;
    for (let i = 0; i < key.length; i++)
      sum = (sum * 19 + key.charCodeAt(i)) % this.size;

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
      this.table[index] = { key, docCount: fileMap.size, postingPos: -1, fileMap };
      this.used++;
    }
  }

  getData(key: string): number {
    this.lookups++;
    const index = this.find(key);
    return this.table[index].key === "" ? -1 : this.table[index].docCount;
  }

  getUsage() {
    return { used: this.used, collisions: this.collisions, lookups: this.lookups };
  }

  generatePostingRows(): string[] {
    const rows = [
      "| Nombre del archivo | Frecuencia |",
      "|--------------------|------------|",
    ];
    let position = 0;
    for (const entry of this.table) {
      if (entry.key === "") continue;
      entry.postingPos = position;
      for (const [filename, freq] of entry.fileMap.entries())
        rows.push(`| ${filename} | ${freq} |`);
      position += entry.docCount;
    }
    return rows;
  }

  generateDictionaryRows(): string[] {
    const rows = [
      "| # | Token | Núm. documentos | Posición en posting |",
      "|---|-------|-----------------|---------------------|",
    ];
    for (let i = 0; i < this.table.length; i++) {
      const e = this.table[i];
      if (e.key === "") rows.push(`| ${i} |      | 0 | -1 |`);
      else              rows.push(`| ${i} | ${e.key} | ${e.docCount} | ${e.postingPos} |`);
    }
    return rows;
  }

  getTableSize() { return this.size; }
}

// Ejecución de la tarea

const main = async () => {
  const totalStart = performance.now();
  const timings: { filename: string; durationMs: number }[] = [];
  const logLines: string[] = [];

  // Cargar stop list
  const stopList = await loadStopList("./a9_stopListFiles/StopList.txt"); // Pasé las palabras del pdf a txt

  // Contadores de filtros para el log
  let removedByStopList  = 0;
  let removedByLength    = 0;
  let removedByFrequency = 0;

  // Paso 1 - Leer archivos
  const rawStats = new Map<string, Map<string, number>>();

  for await (const entry of readDir("./FilesSortedWords")) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;

    const fileStart = performance.now();

    const content = await readTextFile(`./FilesSortedWords/${entry.name}`);
    const words = content
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    for (const word of words) {
      if (!rawStats.has(word)) rawStats.set(word, new Map());
      const fileMap = rawStats.get(word)!;
      fileMap.set(entry.name, (fileMap.get(entry.name) ?? 0) + 1);
    }

    timings.push({ filename: entry.name, durationMs: performance.now() - fileStart });
  }

  // Paso 2 - Aplicar filtros del StopList antes de insertar en la hash table
  const filteredStats = new Map<string, Map<string, number>>();

  for (const [token, fileMap] of rawStats.entries()) {
    const totalFreq = [...fileMap.values()].reduce((a, b) => a + b, 0);
    const { remove, reason } = shouldRemove(token, totalFreq, stopList);

    if (remove) {
      if (reason === "stop list")               removedByStopList++; // Cuenta cuántos se quitaron
      else if (reason.startsWith("frecuencia")) removedByFrequency++;
      else                                      removedByLength++;
    } else {
      filteredStats.set(token, fileMap);
    }
  }

  // Paso 3 - Insertar en hash table solo tokens válidos
  const ht = new HashTable(filteredStats.size);
  for (const [token, fileMap] of filteredStats.entries())
    ht.insert(token, fileMap);

  // Paso 4 - Generar archivos
  const postingRows    = ht.generatePostingRows();
  const dictionaryRows = ht.generateDictionaryRows();
  const { used, collisions, lookups } = ht.getUsage();
  const totalMs = performance.now() - totalStart;

  // Paso 5 - Crear log
  logLines.push("# Log de procesamiento - a9_leo");
  logLines.push("");
  logLines.push(" Tiempos por archivo");
  logLines.push("| Archivo | Tiempo (ms) |");
  logLines.push("|---------|-------------|");
  for (const t of timings)
    logLines.push(`| ${t.filename} | ${t.durationMs.toFixed(3)} |`);

  logLines.push("");
  logLines.push(" Filtros aplicados");
  logLines.push("| Filtro | Criterio | Tokens eliminados |");
  logLines.push("|--------|----------|-------------------|");
  logLines.push(`| Stop list | Palabras del archivo stoplist.txt | ${removedByStopList} |`);
  logLines.push(`| Longitud | Tokens de 1 carácter | ${removedByLength} |`);
  logLines.push(`| Frecuencia baja | Menos de ${MIN_FREQUENCY} repeticiones totales | ${removedByFrequency} |`);

  logLines.push("");
  logLines.push(" Resumen");
  logLines.push("| Métrica | Valor |");
  logLines.push("|---------|-------|");
  logLines.push(`| Tokens antes de filtrar | ${rawStats.size} |`);
  logLines.push(`| Tokens eliminados total | ${rawStats.size - filteredStats.size} |`);
  logLines.push(`| Tokens en diccionario final | ${filteredStats.size} |`);
  logLines.push(`| Tamaño de la hash table | ${ht.getTableSize()} |`);
  logLines.push(`| Entradas usadas | ${used} |`);
  logLines.push(`| Colisiones | ${collisions} |`);
  logLines.push(`| Lookups | ${lookups} |`);
  logLines.push(`| Factor de carga | ${(used / ht.getTableSize()).toFixed(4)} |`);
  logLines.push(`| Tiempo total | ${totalMs.toFixed(3)} ms |`);

  // Paso 6 - escribir archivos
  await Deno.mkdir("./a9_stopListFiles", { recursive: true });
  await writeTextFile(dictionaryFile, dictionaryRows.join("\n"));
  await writeTextFile(postingFile,    postingRows.join("\n"));
  await writeTextFile(logFile,        logLines.join("\n"));
};

await main();