const { readTextFile, readDir, writeTextFile } = Deno;
const logFile5 = "a5_leo.txt"; // Counted

const wordCounter = async () => {
  const globalFreq = new Map<string, number>();

  for await (const entry of readDir("./FilesSortedWords")) {
    if (entry.isFile && entry.name.endsWith(".txt")) {
      try {
        const fileContent = await readTextFile(
          `./FilesSortedWords/${entry.name}`,
        );

        const words = fileContent
          .split("\n") //Las separa por línea
          .map((w) => w.toLowerCase()) // Hacerla minúscula cada palabra
          .sort(); //Ordena
          

        for (const word of words) {
          if (globalFreq.has(word)) {
            const currentCount = globalFreq.get(word);
            const newCount = currentCount! + 1;
            globalFreq.set(word, newCount);
          } else {
            globalFreq.set(word, 1);
          }
        }
      } catch (error: any) {
        throw new Error(`Error procesando ${entry.name}: ${error.message}`);
      }
    }
  }

  const outputContent = [...globalFreq.entries()]
    .map(([word, count]) => `${word} -> ${count}`)
    .join("\n");

  await writeTextFile(logFile5, outputContent);
};

await wordCounter();
export default wordCounter;
