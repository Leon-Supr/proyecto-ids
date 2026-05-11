Deno.serve({ port: 8080 }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Motor de Búsqueda</title>
  <style>
    body      { font-family: Arial, sans-serif; max-width: 700px; margin: 60px auto; }
    h1        { color: #333; }
    .search-box { display: flex; gap: 8px; margin-bottom: 24px; }
    input     { flex: 1; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }
    button    { padding: 10px 20px; font-size: 16px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #1558b0; }
    .result   { margin-bottom: 16px; }
    .result a { font-size: 18px; color: #1a0dab; text-decoration: none; }
    .result a:hover { text-decoration: underline; }
    .ranking  { color: #666; font-size: 13px; margin-top: 4px; }
    #status   { color: #888; font-style: italic; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Motor de Búsqueda</h1>
  <div class="search-box">
    <input id="query" type="text" placeholder="Ej: lawyer consumers" />
    <button id="btn">Buscar</button>
  </div>
  <div id="status"></div>
  <div id="resultados"></div>

  <script>
    document.getElementById('query').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') buscar();
    });

    document.getElementById('btn').addEventListener('click', buscar);

    function buscar() {
      var q = document.getElementById('query').value.trim();
      if (!q) return;

      document.getElementById('status').textContent    = 'Buscando...';
      document.getElementById('resultados').innerHTML  = '';

      fetch('/search?q=' + encodeURIComponent(q))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          document.getElementById('status').textContent =
            data.results.length > 0
              ? 'Top ' + data.results.length + ' resultados para: ' + data.query
              : 'Sin resultados para: ' + data.query;

          var container = document.getElementById('resultados');

          data.results.forEach(function(r, i) {
            var div      = document.createElement('div');
            div.className = 'result';

            var link       = document.createElement('a');
            link.href      = '/files/' + r.filename;
            link.target    = '_blank';
            link.textContent = (i + 1) + '. ' + r.filename;

            var ranking       = document.createElement('div');
            ranking.className = 'ranking';
            ranking.textContent = 'Ranking (tf.idf): ' + r.score;

            div.appendChild(link);
            div.appendChild(ranking);
            container.appendChild(div);
          });
        })
        .catch(function(err) {
          document.getElementById('status').textContent = 'Error: ' + err;
        });
    }
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname.startsWith("/files/")) {
    const filename = url.pathname.replace("/files/", "");
    try {
      const content = await Deno.readTextFile("./FilesHTML/" + filename);
      return new Response(content, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("Archivo no encontrado", { status: 404 });
    }
  }

  if (url.pathname === "/search") {
    const query  = url.searchParams.get("q") ?? "";
    const tokens = query.toLowerCase().split(" ").filter(Boolean);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ query, results: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const command = new Deno.Command("deno", {
        args: [
          "run", "--allow-read", "--allow-write",
          "a13_busquedasOptimizadas.ts",
          ...tokens,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout } = await command.output();
      const output     = new TextDecoder().decode(stdout);

      const results: { filename: string; score: string }[] = [];
      for (const line of output.split("\n")) {
        const match = line.match(/\d+\.\s+(\S+)\s+\(score:\s+([\d.]+)\)/);
        if (match) results.push({ filename: match[1], score: match[2] });
      }

      return new Response(JSON.stringify({ query, results }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ query, results: [], error: String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Not found", { status: 404 });
});

console.log("Servidor corriendo en http://localhost:8080");