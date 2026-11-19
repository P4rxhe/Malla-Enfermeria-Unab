import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

async function initAndCommit() {
  console.log(`Inicializando repositorio git en ${dir}...`);
  await git.init({ fs, dir, defaultBranch: 'main' });

  // Leer archivos recursivamente excepto node_modules, dist y .git
  function getFiles(base, rel = '') {
    const full = path.join(base, rel);
    const entries = fs.readdirSync(full, { withFileTypes: true });
    let files = [];
    for (const ent of entries) {
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') {
        continue;
      }
      if (ent.isDirectory()) {
        files = files.concat(getFiles(base, relPath));
      } else {
        files.push(relPath);
      }
    }
    return files;
  }

  const filesToAdd = getFiles(dir);
  console.log(`Agregando ${filesToAdd.length} archivos al commit inicial...`);

  for (const file of filesToAdd) {
    await git.add({ fs, dir, filepath: file });
  }

  const sha = await git.commit({
    fs,
    dir,
    message: 'feat: Initial commit - Malla Interactiva Enfermeria UNAB',
    author: {
      name: 'P4rxhe',
      email: 'p4rxhe@users.noreply.github.com'
    }
  });

  console.log(`✅ Commit inicial creado exitosamente con SHA: ${sha}`);

  // Configurar remote origin
  await git.setConfig({
    fs,
    dir,
    path: 'remote.origin.url',
    value: 'https://github.com/P4rxhe/Malla-Enfermeria-Unab.git'
  });
  await git.setConfig({
    fs,
    dir,
    path: 'remote.origin.fetch',
    value: '+refs/heads/*:refs/remotes/origin/*'
  });
  await git.setConfig({
    fs,
    dir,
    path: 'branch.main.remote',
    value: 'origin'
  });
  await git.setConfig({
    fs,
    dir,
    path: 'branch.main.merge',
    value: 'refs/heads/main'
  });

  console.log(`✅ Remoto origin configurado hacia: https://github.com/P4rxhe/Malla-Enfermeria-Unab.git`);
}

initAndCommit().catch(err => {
  console.error('Error configurando git:', err);
  process.exit(1);
});
