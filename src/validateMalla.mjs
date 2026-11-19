import mallaData from './data/mallaEnfermeria.json' with { type: 'json' };

const ramos = mallaData.ramos;
const idSet = new Set(ramos.map(r => r.id));
let errors = 0;

console.log(`Verificando ${ramos.length} asignaturas...`);

ramos.forEach(r => {
  // Prerrequisitos
  r.prerrequisitos.forEach(pId => {
    if (!idSet.has(pId)) {
      console.error(`❌ Error en ${r.id}: Prerrequisito inexistente '${pId}'`);
      errors++;
    }
  });

  // Correquisitos
  r.correquisitos.forEach(cId => {
    if (!idSet.has(cId)) {
      console.error(`❌ Error en ${r.id}: Correquisito inexistente '${cId}'`);
      errors++;
    }
  });
});

if (errors === 0) {
  console.log(`✅ ¡Validación perfecta! Todas las relaciones y dependencias existen en el JSON.`);
} else {
  console.error(`⚠️ Se encontraron ${errors} errores de referencia.`);
}