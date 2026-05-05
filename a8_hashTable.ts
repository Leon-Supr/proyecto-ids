const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a8_hashTableFiles/a8_dictionary.md";
const postingFile = "./a8_hashTableFiles/a8_posting.txt";
const logFile = "./a8_hashTableFiles/a8_leo.txt";

// Estrucutra de cada entrada en la hashtable
// Cada entrada debe tendrá estos cuatro datos
interface HashEntry {
  key: string; //El token
  docCount: number; //Documentos que aparece
  postingPos: number; // Linea del posting donde empiezan sus registros
  fileMap: Map<string, number>; //Archivos que lo tienen y qué frecuencia
}

class HashTable {
  private table: HashEntry[];
  private size: number;
  private used: number; //Entradas ya ocupadas
  private collisions: number; //Colisiones: Tokens que quisieron misma entrada
  private lookups: number; //Num de busquedas

  constructor(estimatedSize: number) {
    this.size = estimatedSize * 3; // Estimar el tamaño de tabla que se ocupará
    this.used = 0;
    this.collisions = 0;
    this.lookups = 0;

    // Inicializa todos los cajones como vacíos
    // key: "" significa vacío, postingPos: -1 significa sin asignar
    this.table = Array.from({ length: this.size }, () => ({
      key: "",
      docCount: 0,
      postingPos: -1,
      fileMap: new Map(),
    }));
  }

  // Calcula en qué posición debería ir el token
  // Se usa la formula hash base 19, pues es número primo y ayuda a la distribución (evita patrones)
  private find(key: string): number {
    let sum = 0;
    // Procesa la palabra letra por letra para calcular su posición
    for (let i = 0; i < key.length; i++) {
      sum = (sum * 19 + key.charCodeAt(i)) % this.size; // mismo algoritmo del C++
    }

    let index = sum % this.size;

    // Linear probing: busca hasta encontrar la clave o un espacio vacío
    while (this.table[index].key !== "" && this.table[index].key !== key) {
      index = (index + 1) % this.size;
      this.collisions++; // Cuántas veces se tuvo que mover por colisión
    }

    return index;
  }

  // Mete el token en la tabla si no existe aún
  insert(key: string, fileMap: Map<string, number>): void {
    const index = this.find(key);

    if (this.table[index].key === "") { // Si está vacía la posición, lo guarda
      this.table[index] = {
        key,
        docCount: fileMap.size,
        postingPos: -1, // Se asignará al generar el posting
        fileMap,
      };
      this.used++;
    }
    // Si ya existe, no hace nada (igual que el C++)
  }

  // Busca un token y regresa cuántos documentos lo contienen
  // Regresa -1 si el toen no existe en la tabla
  getData(key: string): number {
    this.lookups++;
    const index = this.find(key);
    return this.table[index].key === "" ? -1 : this.table[index].docCount;
  }

  // Las métricas de la tabla hash para el log
  getUsage(): { used: number; collisions: number; lookups: number } {
    return {
      used: this.used,
      collisions: this.collisions,
      lookups: this.lookups,
    };
  }

  // Creación del diccionario
  generateDictionaryRows(): string[] {
    const rows: string[] = [
      "| # | Token | Núm. documentos | Posición en posting |",
      "|---|-------|-----------------|---------------------|",
    ];

    for (let i = 0; i < this.table.length; i++) {
      const e = this.table[i];
      if (e.key === "") {
        rows.push(`| ${i} |  | 0 | -1 |`); // Si la entrada quedó vacía
      } else {
        rows.push(`| ${i} | ${e.key} | ${e.docCount} | ${e.postingPos} |`); // SI está ocupada, muestra los datos del token
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

    let position = 0; // Cuenta de linea del posting 

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

// Ejecución de la tarea

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

  // Paso 2 — Se crea hashtable en base a estos datos
  const ht = new HashTable(rawStats.size);

  for (const [token, fileMap] of rawStats.entries()) {
    ht.insert(token, fileMap);
  }

  // Paso 3 — Generar los archivos
  const postingRows = ht.generatePostingRows(); // calcula postingPos internamente
  const dictionaryRows = ht.generateDictionaryRows();
  const { used, collisions, lookups } = ht.getUsage();
  const totalMs = performance.now() - totalStart;

  // Paso 4 — Creación de logs
  logLines.push("# Log de procesamiento — a8_leo");
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
};

await main();
