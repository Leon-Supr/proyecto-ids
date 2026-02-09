const { readTextFile, readDir, writeTextFile } = Deno;

const logFile = "a1_leo&franco.txt"; // Log de lectura
const logFile2 = "a2_leo&franco.txt"; // Limpieza
const logFile3 = "a3_leo&franco.txt"; // Ordenamiento

// Asegurar que existen las carpetas, si no están, crearlas
const ensureDirectories = async (): Promise<void> => {
  await Deno.mkdir("./FilesClean", { recursive: true });
  await Deno.mkdir("./FilesSortedWords", { recursive: true });
};

// Función de ordenamiento de palabras alfebéticamente
const formatCleanHtml = async (fileName: string): Promise<void> => {
  try {
    const fileContent = await readTextFile(`./FilesClean/${fileName}`);
    const words = fileContent
      .split(/[\s.,()#;:~&%"/-]+/) //Separa por símbolos
      .filter((w) => w.length > 1) // elimina vacíos y palabras que sean menores a 1 letra
      .filter((w) => !/^\d+$/.test(w)); // elimina palabras que sean puros números
    const sortedWords = words.sort((a, b) => a.localeCompare(b)); //Ordena alfabéticamente
    const output = sortedWords.join("\n");
    const outputFileName = fileName.replace(/_clean\.txt$/i, "_sorted.txt");
    await writeTextFile(`./FilesSortedWords/${outputFileName}`, output);
  } catch (error: any) {
    throw new Error(`Error procesando ${fileName}: ${error.message}`);
  }
};

// Función de limpieza de etiquetas de Html
const removeHtmlTags = async (fileName: string): Promise<void> => {
  try {
    const htmlContent = await readTextFile(`./Files/${fileName}`);
    const cleanContent = htmlContent.replace(/<\/?[^>]+>/g, ""); // Remplaza etiquetas con vacío
    const outputFileName = fileName.replace(/\.html$/i, "_clean.txt");
    await writeTextFile(`./FilesClean/${outputFileName}`, cleanContent);
  } catch (error: any) {
    throw new Error(`Error procesando ${fileName}: ${error.message}`);
  }
};

// Programa principal, de lectura de los archivos y creación de los logs
try {
  await ensureDirectories();
  //Empieza a tomar tiempo del programa e inicializa el archivo de logs
  const programStart = performance.now();
  await writeTextFile(logFile, "Log de tiempos de apertura\n\n"); //Log Act1
  await writeTextFile(logFile2, "Log de tiempos de limpieza\n\n"); //Log Act2
  await writeTextFile(logFile3, "Log de tiempos de ordenamiento\n\n"); //Log Act2

  //Lee el directorio y maneja errores
  for await (const entry of readDir("./Files")) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      try {
        const start = performance.now();
        await readTextFile(`./Files/${entry.name}`);
        const end = performance.now();

        const start2 = performance.now();
        await removeHtmlTags(entry.name);
        const end2 = performance.now();

        const start3 = performance.now();
        const cleanFileName = entry.name.replace(/\.html$/i, "_clean.txt");
        await formatCleanHtml(cleanFileName);
        const end3 = performance.now();

        //Calcula tiempos de lectura y anexa estos datos al archivo de logs
        const time = (end - start).toFixed(4);
        const line = `${entry.name} -> ${time} ms\n`;
        await writeTextFile(logFile, line, { append: true });

        //Calcula tiempos de limpieza y anexa estos datos al archivo de logs
        const time2 = (end2 - start2).toFixed(4);
        const line2 = `${entry.name} -> ${time2} ms\n`;
        await writeTextFile(logFile2, line2, { append: true });

        //Calcula tiempos de ordenamiento y anexa estos datos al archivo de logs
        const time3 = (end3 - start3).toFixed(4);
        const line3 = `${entry.name} -> ${time3} ms\n`;
        await writeTextFile(logFile3, line3, { append: true });
      } catch (error: any) {
        const errorLine = `Error leyendo ${entry.name}: ${error.message}\n`;
        await writeTextFile(logFile, errorLine, { append: true });
      }
    }
  }

  //Calcula tiempo final y añade esto a archivo final
  const programEnd = performance.now();
  const totalTime = (programEnd - programStart).toFixed(4);
  const totalTimeLine = `Tiempo total de programa: ${totalTime} ms`;
  await writeTextFile(logFile, totalTimeLine, { append: true });
  await writeTextFile(logFile2, totalTimeLine, { append: true });
  await writeTextFile(logFile3, totalTimeLine, { append: true });
} catch (globalError: any) {
  console.error("ERROR CRÍTICO:", globalError.message);
}
