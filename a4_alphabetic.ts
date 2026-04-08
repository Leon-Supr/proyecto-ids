const { readTextFile, readDir, writeTextFile } = Deno;
const logFile4 = "a4_leo.txt"; // Consolidado

const Alphabetic = async () => {
  const allWordsArray: string[] = [];

  for await (const entry of readDir("./FilesSortedWords")) {
    if (entry.isFile && entry.name.endsWith(".txt")) {
      try {
        const fileContent = await readTextFile(
          `./FilesSortedWords/${entry.name}`,
        );

        const words = fileContent
          .split("\n") //Las separa por línea
          .map((w) => w.toLowerCase()) // Hacerla minúscula cada palabra

        allWordsArray.push(...words);

      } catch (error: any) {
        throw new Error(`Error procesando ${entry}: ${error.message}`);
      }
    }
  }

  allWordsArray.sort((a, b) => a.localeCompare(b, "es")); // Las ordena alfabéticamente, en base al español
  await writeTextFile(logFile4, allWordsArray.join("\n"));
};

export default Alphabetic;
