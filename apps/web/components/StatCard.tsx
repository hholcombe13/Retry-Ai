interface StatCardProps {
  title: string;
  value: string;
  detail?: string;
}

export const StatCard = ({ title, value, detail }: StatCardProps) => {
  return (
    <article className="stat-card">
      <h2>{title}</h2>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
};
