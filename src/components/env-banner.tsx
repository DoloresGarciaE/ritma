/**
 * Franja de entorno (ticket ambientes DEV/PROD): en todo deploy que NO es producción
 * (VERCEL_ENV=preview: el DEV estable de `main` y los previews de PR) se ve una franja
 * "DEV" arriba de todo, para que nadie confunda dónde está parado. En producción y en
 * `npm run dev` local no existe. Server component: lee la env en el server, cero JS.
 */
export function EnvBanner() {
  if (process.env.VERCEL_ENV !== "preview") return null;

  return (
    <div className="bg-primary text-center text-xs leading-5 font-medium text-on-primary">
      DEV — ambiente de prueba
    </div>
  );
}
