/** Marca de la pestaña donde se inició sesión (sessionStorage se borra al cerrar la pestaña). */
export const TAB_SESSION_KEY = "sesion-pestana";

/**
 * Corre al leer el HTML, antes de que se pinte la app: si la pestaña no tiene
 * la marca, oculta la página para que no se alcance a ver nada mientras
 * TabSessionGuard cierra la sesión y manda a /login. Inserta un <style> en vez
 * de tocar elementos de React, para no romper la hidratación.
 */
const script = `try{if(!sessionStorage.getItem(${JSON.stringify(TAB_SESSION_KEY)})){var s=document.createElement("style");s.textContent="body{visibility:hidden}";document.head.appendChild(s)}}catch(e){}`;

export function TabSessionScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
