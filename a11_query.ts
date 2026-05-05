const { readTextFile, writeTextFile } = Deno;

const postingFile    = "./a10_weightTokensFiles/a10_posting.txt";
const documentsFile  = "./a11_queryFiles/a11_documents.txt";
const newPosting     = "./a11_queryFiles/a11_posting.txt";
const logFile        = "./a11_queryFiles/a11_leo.txt";
const tableSizeDest  = "./a11_queryFiles/tablesize.txt";

// a10 escribió el posting con columnas de 40 bytes — hay que leerlo igual
const A10_POST_COL = 40;

// El nuevo posting de a11 usa columnas de 20 bytes (docId + tfidf caben bien)
const A11_POST_COL = 20;
const DOCS_COL     = 40;

const pad = (str: string, width: number) =>
  str.substring(0, width).padEnd(width, " ");

const main = async () => {
  const totalStart = performance.now();
  const logLines: string[] = [];

  // Paso 1 — Leer el posting de a10 con el ancho correcto (40 bytes por columna)
  const postingContent = await readTextFile(postingFile);
  const postingLines   = postingContent.split("\n").slice(2); // salta encabezado y separador

  // Asigna un ID único a cada filename nuevo que encuentre
  const filenameToId = new Map<string, number>();
  let nextId = 0;

  for (const line of postingLines) {
    const filename = line.substring(0, A10_POST_COL).trim(); // ← 40, no 20
    if (filename && !filenameToId.has(filename)) {
      filenameToId.set(filename, nextId++);
    }
  }

  // Paso 2 — Generar archivo de documentos (ID → filename)
  const docRows = [
    pad("DocumentID", DOCS_COL) + pad("Nombre del archivo", DOCS_COL),
    "-".repeat(DOCS_COL * 2),
  ];
  for (const [filename, id] of filenameToId.entries())
    docRows.push(pad(String(id), DOCS_COL) + pad(filename, DOCS_COL));

  // Paso 3 — Reescribir el posting con DocumentID en lugar de filename
  const newPostingRows = [
    pad("DocumentID", A11_POST_COL) + pad("tf.idf", A11_POST_COL),
    "-".repeat(A11_POST_COL * 2),
  ];
  for (const line of postingLines) {
    const filename = line.substring(0, A10_POST_COL).trim(); // ← 40 para leer
    const tfidf    = line.substring(A10_POST_COL).trim();
    if (!filename) continue;
    const id = filenameToId.get(filename) ?? -1;
    newPostingRows.push(
      pad(String(id), A11_POST_COL) +
      pad(tfidf, A11_POST_COL),
    );
  }

  const totalMs = performance.now() - totalStart;

  // Log
  logLines.push("LOG DE PROCESAMIENTO — a11_leo");
  logLines.push("=".repeat(50));
  logLines.push(pad("Total de documentos:", 30) + filenameToId.size);
  logLines.push(pad("Tiempo total:", 30)        + `${totalMs.toFixed(3)} ms`);

  await Deno.mkdir("./a11_queryFiles", { recursive: true });
  await writeTextFile(documentsFile, docRows.join("\n"));
  await writeTextFile(newPosting,    newPostingRows.join("\n"));
  await writeTextFile(logFile,       logLines.join("\n"));

  // Paso 4 — Copiar tablesize.txt de a10 a a11 para que a13 lo encuentre
  const tableSize = await readTextFile("./a10_weightTokensFiles/tablesize.txt");
  await writeTextFile(tableSizeDest, tableSize);
};

await main();