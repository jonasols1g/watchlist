import { useParams } from "react-router-dom";

export function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <section>
      <h1 className="text-2xl font-bold">Tittel</h1>
      <p className="mt-2 text-slate-600">
        Detaljer for <span className="font-mono">{id}</span> kommer her.
      </p>
    </section>
  );
}
