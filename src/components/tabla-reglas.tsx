import styles from "../app/clasificacion/clasificacion.module.css";

export function TablaReglas({
  titulo,
  columnas,
  filas,
}: {
  titulo: string;
  columnas: readonly [string, string];
  filas: readonly (readonly [string, string])[];
}) {
  return (
    <table className={styles.rulesTable}>
      <caption>{titulo}</caption>
      <thead>
        <tr>{columnas.map((columna) => <th scope="col" key={columna}>{columna}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map(([nombre, valor]) => (
          <tr key={nombre}><th scope="row">{nombre}</th><td>{valor}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
