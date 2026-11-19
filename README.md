# 🩺 Malla Interactiva - Enfermería UNAB

Malla curricular interactiva para la carrera de **Enfermería** de la **Universidad Andrés Bello (UNAB)**. Permite a los estudiantes visualizar su avance académico, marcar asignaturas aprobadas, desbloquear ramos futuros y entender las dependencias críticas (prerrequisitos, co-requisitos ligados y campos clínicos).

Inspirada en herramientas interactivas universitarias y adaptada fielmente a la malla oficial de la UNAB.

---

## ✨ Características

- 📊 **10 Semestres y 5 Años Completos**: Todos los ramos con sus códigos oficiales (EFER, MOR, QUI, BIO, SPU, etc.) y créditos.
- 🔒 **Árbol de Prerrequisitos**: Los ramos bloqueados solo se activan cuando sus prerrequisitos han sido aprobados.
- 🔗 **Ramos Ligados (Co-requisitos obligatorios)**: Representación de las líneas rojas punteadas del plan oficial (ramos que deben cursarse simultáneamente, como en 5° y 8° semestre).
- ⭐ **Campos Clínicos**: Identificación visual inmediata de ramos con horas prácticas en campos asistenciales.
- 🎨 **Interacción Visual**: Al pasar el cursor sobre un ramo, se iluminan:
  - 🟢 **Verde**: Sus prerrequisitos previos.
  - 🟣 **Púrpura**: Los ramos futuros que desbloquea.
  - 🔴 **Rojo/Rosa**: Sus co-requisitos ligados.
- 💾 **Persistencia Automática**: Tu progreso se guarda en `localStorage` del navegador.
- ⚡ **100% Estático y Ágil**: Todo el contenido se alimenta de un archivo JSON estructurado (`src/data/mallaEnfermeria.json`), facilitando futuras actualizaciones y mantenimiento sin necesidad de bases de datos complejas.
- 📱 **Totalmente Responsivo**: Cómodo en computadores, tablets y celulares.
- 🎉 **Celebración de Graduación**: Efecto especial al completar el 100% de la carrera.

---

## 🛠️ Tecnologías

- **React 18**
- **Vite**
- **Tailwind CSS**
- **Lucide React** (Iconos)
- **Canvas Confetti**

---

## 🚀 Cómo ejecutar en Visual Studio Code

1. Abre la carpeta del proyecto en **Visual Studio Code**:
   ```bash
   cd Malla-Enfermeria-Unab
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo local:
   ```bash
   npm run dev
   ```
4. Abre el enlace que te mostrará la terminal (por defecto `http://localhost:3000` o `http://localhost:5173`).

---

## 📦 Cómo subir los cambios a GitHub

El proyecto ya está configurado para conectarse al repositorio remoto:
`https://github.com/P4rxhe/Malla-Enfermeria-Unab.git`

Desde la terminal de VS Code:
```bash
git add .
git commit -m "feat: Malla interactiva de Enfermería UNAB completa con React, Tailwind y JSON"
git branch -M main
git push -u origin main
```

*(O simplemente desde la pestaña lateral de **Control de Código Fuente** de Visual Studio Code haciendo clic en **Confirmar y Sincronizar**).*

---

## 🌐 Despliegue en Vercel (Recomendado)

1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Selecciona **"Add New Project"** e importa el repositorio `P4rxhe/Malla-Enfermeria-Unab`.
3. Vercel detectará automáticamente que es un proyecto **Vite**. Haz clic en **Deploy**.
4. ¡En menos de 1 minuto tendrás tu enlace público funcionando!
