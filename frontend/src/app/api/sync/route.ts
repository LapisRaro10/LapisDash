import { NextResponse } from 'next/server';

export async function POST() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const workflowId = process.env.GITHUB_WORKFLOW_ID;

  if (!token || !repo || !workflowId) {
    return NextResponse.json(
      { status: 'error', message: 'Variáveis de ambiente do GitHub não configuradas' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    if (response.status === 204) {
      return NextResponse.json({ status: 'ok', message: 'Sincronização disparada com sucesso. Aguarde alguns segundos e acompanhe o status.' });
    } else {
      const errorText = await response.text();
      return NextResponse.json(
        { status: 'error', message: `Erro GitHub: ${response.status} - ${errorText}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao disparar sincronização";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
