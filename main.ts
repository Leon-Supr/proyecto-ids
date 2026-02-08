const { readTextFile, readDir, writeTextFile } = Deno;

const logFile = "a1_2875403.txt";
const logFile2 = "a2_2875403.txt"
// <\/?[^>]*>
const removeHtmlTags = async (fileName: string): Promise<void> => {
  const htmlContent = await readTextFile(`./Files/${fileName}`)
  const cleanContent = htmlContent.replace(/<\/?[^>]+>/g, "")
  const outputFileName = fileName.replace(/\.html$/i, "_clean.txt")
  await writeTextFile(`./FilesClean/${outputFileName}`, cleanContent)
};

try {
  //Empieza a tomar tiempo del programa e inicializa el archivo de logs
  const programStart = performance.now();
  await writeTextFile(logFile, "Log de tiempos de apertura\n\n"); //Log Act1
  await writeTextFile(logFile2, "Log de tiempos de limpieza\n\n") //Log Act2

  //Lee el directorio y maneja errores
  for await (const entry of readDir("./Files")) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      try {
        const start = performance.now();
        await readTextFile(`./Files/${entry.name}`);
        const end = performance.now();

        const start2 = performance.now()
        await removeHtmlTags(entry.name)
        const end2 = performance.now()

        //Calcula tiempos de lectura y anexa estos datos al archivo de logs
        const time = (end - start).toFixed(4);
        const line = `${entry.name} -> ${time} ms\n`;
        await writeTextFile(logFile, line, { append: true });

        //Calcula tiempos de limpieza y anexa estos datos al archivo de logs
        const time2 = (end2 - start2).toFixed(4);
        const line2 = `${entry.name} -> ${time2} ms\n`;
        await writeTextFile(logFile2, line2, { append: true });
        
      } catch (err: any) {
        const errorLine = `Error leyendo ${entry.name}: ${err.message}\n`;
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
} catch (globalError: any) {
  console.error("ERROR CRÍTICO:", globalError.message);
}
