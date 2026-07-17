import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Siden finnes ikke</h1>
      <p className="mt-2 text-slate-600">
        Fant ikke siden du lette etter.{" "}
        <Link to="/" className="underline">
          Gå til forsiden
        </Link>
        .
      </p>
    </section>
  );
}
