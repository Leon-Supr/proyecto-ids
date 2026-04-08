const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a8_hashTableFiles/a8_dictionary.md";
const postingFile = "./a8_hashTableFiles/a8_posting.txt";
const logFile = "./a8_hashTableFiles/a8_leo.txt";

// ─── Hash Table ────────────────────────────────────────────────────────────────

interface HashEntry {
  key: string;
  docCount: number;
  postingPos: number;
  fileMap: Map<string, number>;
}

class HashTable {
  private table: HashEntry[];
  private size: number;
  private used: number;
  private collisions: number;
  private lookups: number;

  constructor(estimatedSize: number) {
    this.size = estimatedSize * 3; // igual que el C++: Size * 3
    this.used = 0;
    this.collisions = 0;
    this.lookups = 0;

    // Inicializar toda la tabla vacía (equivalente al for del constructor C++)
    this.table = Array.from({ length: this.size }, () => ({
      key: "",
      docCount: 0,
      postingPos: -1,
      fileMap: new Map(),
    }));
  }

  // Equivalente a Find() en C++ — hash base 19 + linear probing
  private find(key: string): number {
    let sum = 0;
    for (let i = 0; i < key.length; i++) {
      sum = (sum * 19 + key.charCodeAt(i)) % this.size; // mismo algoritmo del C++
    }

    let index = sum % this.size;

    // Linear probing: busca hasta encontrar la clave o un espacio vacío
    while (this.table[index].key !== "" && this.table[index].key !== key) {
      index = (index + 1) % this.size;
      this.collisions++;
    }

    return index;
  }

  // Equivalente a Insert() en C++
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
    // Si ya existe, no hace nada (igual que el C++)
  }

  // Equivalente a GetData() en C++
  getData(key: string): number {
    this.lookups++;
    const index = this.find(key);
    return this.table[index].key === "" ? -1 : this.table[index].docCount;
  }

  // Equivalente a GetUsage() en C++
  getUsage(): { used: number; collisions: number; lookups: number } {
    return {
      used: this.used,
      collisions: this.collisions,
      lookups: this.lookups,
    };
  }

  // Equivalente a Print() en C++ — genera las filas del diccionario
  generateDictionaryRows(): string[] {
    const rows: string[] = [
      "| # | Token | Núm. documentos | Posición en posting |",
      "|---|-------|-----------------|---------------------|",
    ];

    for (let i = 0; i < this.table.length; i++) {
      const e = this.table[i];
      if (e.key === "") {
        rows.push(`| ${i} |  | 0 | -1 |`);
      } else {
        rows.push(`| ${i} | ${e.key} | ${e.docCount} | ${e.postingPos} |`);
      }
    }

    return rows;
  }

  // Calcula posiciones de posting y genera las filas del archivo posting
  generatePostingRows(): string[] {
    const rows: string[] = [
      "| Nombre del archivo | Frecuencia |",
      "|--------------------|------------|",
    ];

    let position = 0;

    for (const entry of this.table) {
      if (entry.key === "") continue;

      entry.postingPos = position;

      for (const [filename, freq] of entry.fileMap.entries()) {
        rows.push(`| ${filename} | ${freq} |`);
      }

      position += entry.docCount;
    }

    return rows;
  }

  getTableSize(): number {
    return this.size;
  }
}

// ─── Principal ─────────────────────────────────────────────────────────────────

const main = async () => {
  const totalStart = performance.now();
  const logLines: string[] = [];
  const timings: { filename: string; durationMs: number }[] = [];

  // Paso 1 — leer archivos
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

    const fileEnd = performance.now();
    timings.push({ filename: entry.name, durationMs: fileEnd - fileStart });
  }

  // Paso 2 — insertar en la hash table
  const ht = new HashTable(rawStats.size);

  for (const [token, fileMap] of rawStats.entries()) {
    ht.insert(token, fileMap);
  }

  // Paso 3 — generar archivos
  const postingRows = ht.generatePostingRows(); // calcula postingPos internamente
  const dictionaryRows = ht.generateDictionaryRows();
  const { used, collisions, lookups } = ht.getUsage();
  const totalMs = performance.now() - totalStart;

  // Paso 4 — log
  logLines.push("# Log de procesamiento — a8_leo");
  logLines.push(`Fecha: ${new Date().toLocaleString("es-MX")}`);
  logLines.push("");
  logLines.push("## Tiempos por archivo");
  logLines.push("| Archivo | Tiempo (ms) |");
  logLines.push("|---------|-------------|");
  for (const t of timings) {
    logLines.push(`| ${t.filename} | ${t.durationMs.toFixed(3)} |`);
  }
  logLines.push("");
  logLines.push("## Resumen");
  logLines.push("| Métrica | Valor |");
  logLines.push("|---------|-------|");
  logLines.push(`| Tokens únicos | ${rawStats.size} |`);
  logLines.push(`| Tamaño de la hash table | ${ht.getTableSize()} |`);
  logLines.push(`| Entradas usadas | ${used} |`);
  logLines.push(`| Colisiones | ${collisions} |`);
  logLines.push(`| Lookups | ${lookups} |`);
  logLines.push(
    `| Factor de carga | ${(used / ht.getTableSize()).toFixed(4)} |`,
  );
  logLines.push(`| Tiempo total | ${totalMs.toFixed(3)} ms |`);

  // Paso 5 — escribir archivos
  await Deno.mkdir("./a8_hashTableFiles", { recursive: true });
  await writeTextFile(dictionaryFile, dictionaryRows.join("\n"));
  await writeTextFile(postingFile, postingRows.join("\n"));
  await writeTextFile(logFile, logLines.join("\n"));

  console.log(`Diccionario : ${dictionaryFile}`);
  console.log(`Posting     : ${postingFile}`);
  console.log(`Log         : ${logFile}`);
  console.log(
    `Tokens: ${rawStats.size} | Tabla: ${ht.getTableSize()} | Colisiones: ${collisions} | Tiempo: ${
      totalMs.toFixed(2)
    } ms`,
  );
};

await main();
