import { CircleAlert, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
      >
        <div className="flex items-center gap-2 font-semibold">
          <CircleAlert className="size-5 shrink-0" aria-hidden />
          <span>Não conseguimos carregar suas tarefas.</span>
        </div>
        <p className="mt-2 leading-relaxed text-destructive/90">
          O painel ainda não tem os dados prontos ou o serviço local não respondeu. Não é nada com a sua conta.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Tentar novamente
        </Button>
        <details className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium hover:text-foreground">Detalhes técnicos</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-destructive/80">{error}</pre>
          <p className="mt-3 font-medium text-foreground">O que verificar</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Na raiz do repositório: rode <code>npm run index</code> e depois <code>npm run web</code>.
            </li>
            <li>
              Sem dados de origem, rode <code>npm run dump</code> na raiz e repita o index.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}

export function NoData({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox className="text-muted-foreground" aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <EmptyDescription>{detail}</EmptyDescription>
        {action}
      </EmptyContent>
    </Empty>
  );
}
