# Como hospedar o LXP Toolkit (Vercel + Oracle Cloud)

Guia **passo a passo para humanos**, do zero. No fim você terá:

- a **interface** (React) publicada de graça no **Vercel**, acessível do celular;
- o **backend** (API + robô que raspa o portal + banco de dados) rodando de graça numa
  **VM do Oracle Cloud Always Free**;
- **atualização automática diária** do conteúdo, além do botão **Atualizar** no app.

> Este guia é a versão amigável. A referência técnica completa fica em
> [`DEPLOY.md`](./DEPLOY.md). Os conceitos de arquitetura/limites estão em
> [`agent-docs/10-deployment.md`](./agent-docs/10-deployment.md).

```
Celular / notebook
        │  https://SEU-APP.vercel.app      ← único endereço que o navegador acessa
        ▼
Vercel: site estático + função /api/* (guarda o segredo)
        │  https://IP.sslip.io             ← Authorization: Bearer TOOLKIT_TOKEN
        ▼
VM Oracle (Docker)
  ├── app  (API + Chromium + LibreOffice)
  ├── db   (Postgres)
  ├── volumes: scraped/ + dados do app
  └── cron diário → /api/refresh
```

---

## Antes de começar

**Quanto custa:** R$ 0. O Vercel Hobby e o Oracle Always Free são gratuitos. O Oracle pede um
cartão só para conferir identidade (não cobra pelos recursos Always Free).

**Quanto tempo:** ~40–60 min na primeira vez.

**O que você precisa:**

- [ ] Conta no **GitHub** com este repositório enviado (veja o Passo 1).
- [ ] Conta no **Vercel** (pode entrar com o GitHub).
- [ ] Conta no **Oracle Cloud** (cartão para verificação).
- [ ] Suas credenciais do portal (`RA` + senha) e, opcional, uma chave da **OpenAI**.
- [ ] (Opcional) um app de terminal no celular/PC para os comandos.

**Limites que você deve conhecer (leia uma vez):**

- O portal pode pedir **reCAPTCHA** quando o login vem de um servidor (IP de datacenter). Nesse
  caso, rode o scrape uma vez de casa, ou configure um proxy residencial. Leitura/uso normal do
  app **não** é afetado.
- O proxy do Vercel aceita **até ~4,5 MB** por requisição. Arquivos de projeto grandes devem ser
  enviados direto na VM.
- Gerações de IA muito longas podem passar de **60 s** e estourar o tempo da função do Vercel
  (plano Hobby). Rascunhos normais ficam abaixo disso.
- Sem internet nenhuma no colégio, **nada na nuvem** é acessível — use o modo local (fim do guia).

---

## Passo 1 — Coloque o código no GitHub

No seu computador, na pasta do projeto:

```bash
git add .
git commit -m "deploy: Vercel + Oracle"
git push origin master
```

> O repositório tem um "guarda" de dados pessoais (`.githooks`). Confira que `.env`, `scraped/`
> e `data/` **não** foram enviados — eles já estão no `.gitignore`.

---

## Passo 2 — Gere os segredos

Você vai usar o **mesmo** `TOOLKIT_TOKEN` em três lugares. Gere uma vez:

```bash
openssl rand -hex 32
```

Guarde o valor (ex.: `9f3c…`). Você também vai definir uma senha para o banco (`POSTGRES_PASSWORD`)
— qualquer senha forte serve.

---

## Passo 3 — Crie a VM no Oracle Cloud

1. Crie a conta em <https://signup.cloud.oracle.com/> (escolha a região mais perto, ex.: São Paulo
   `gru` ou Vinhedo `vcp`).
2. No console, vá em **Compute → Instances → Create instance**.
3. **Name:** `lxp-toolkit`.
4. **Image and shape:** clique em *Edit* → **Image:** Ubuntu 24.04; **Shape:** *Ampere* →
   `VM.Standard.A1.Flex` com **2 OCPU / 12 GB** (pode ajustar até 4/24). Se aparecer "out of
   capacity", tente outra *availability domain* ou região.
5. **Add SSH keys:** *Generate a key pair* e **baixe a chave privada** (`ssh-key-….key`).
6. **Boot volume:** deixe o padrão (aumente para 100 GB se quiser).
7. **Create**. Anote o **Public IP** (ex.: `129.80.12.34`).

### Abra as portas na rede (VCN)

Na página da instância → **Virtual cloud network** → **Security Lists** → *Default Security List* →
**Add Ingress Rules** (repita para cada porta):

| Source CIDR | Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(A porta `22` já vem liberada para SSH.)

### Conecte por SSH

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

---

## Passo 4 — Prepare a VM

Já conectado por SSH:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git caddy
sudo usermod -aG docker "$USER"
newgrp docker
sudo timedatectl set-timezone America/Sao_Paulo
```

### Libere as portas no firewall do sistema (importante no Oracle)

As imagens do Oracle vêm com `iptables` bloqueando 80/443, mesmo com a VCN liberada:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> Se `netfilter-persistent` não existir: `sudo apt-get install -y iptables-persistent` e rode de novo.

---

## Passo 5 — Suba o backend

### 5.1 Baixe o código

```bash
git clone https://github.com/<seu-usuario>/<seu-repo>.git lxp-toolkit
cd lxp-toolkit
```

### 5.2 Crie os arquivos de segredo (não são versionados)

```bash
cp packages/portal/.env.example packages/portal/.env
cp apps/server/.env.example apps/server/.env
cp deploy/.env.prod.example deploy/.env.prod
```

Edite os três:

- `packages/portal/.env` → preencha `LXP_USERNAME` (seu RA) e `LXP_PASSWORD`.
- `apps/server/.env` → preencha `OPENAI_API_KEY` (opcional) e `TOOLKIT_TOKEN=<segredo do Passo 2>`.
  (`DATABASE_URL` aqui é ignorado pelo Docker.)
- `deploy/.env.prod` → `POSTGRES_PASSWORD=<senha forte>` e `TOOLKIT_TOKEN=<o mesmo segredo>`.

Para editar rápido: `nano packages/portal/.env` (salva com `Ctrl+O`, sai com `Ctrl+X`).

### 5.3 Escolha como popular o banco

**Opção A — raspar tudo na própria VM (mais simples):**

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.prod.yml exec -T app npm run dump
docker compose -f docker-compose.prod.yml exec -T app npm run dump-surfaces
docker compose -f docker-compose.prod.yml exec -T app npm run index
docker compose -f docker-compose.prod.yml exec -T app npm run index:web
```

**Opção B — copiar o que já existe no seu computador** (preserva respostas/rascunhos):

No **computador**, com o banco local ligado:

```bash
docker compose exec -T db pg_dump -U lxp -d lxp --no-owner --no-acl > lxp.dump
tar czf scraped.tgz scraped
scp lxp.dump scraped.tgz ubuntu@<PUBLIC_IP>:~/lxp-toolkit/
```

De volta na **VM**:

```bash
cd ~/lxp-toolkit
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d db
docker compose -f docker-compose.prod.yml exec -T db psql -U lxp -d lxp < lxp.dump
docker volume create lxp-toolkit_scraped
tar xzf scraped.tgz
docker run --rm -v lxp-toolkit_scraped:/data -v "$PWD/scraped":/src alpine sh -c 'cp -a /src/. /data/'
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

### 5.4 Confirme que subiu

```bash
docker compose -f docker-compose.prod.yml logs -f app     # Ctrl+C para sair
curl -s http://127.0.0.1:4174/api/health                  # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4174/api/exercises   # 401
```

O `401` é **correto**: sem o token, a API fica privada.

---

## Passo 6 — HTTPS grátis sem comprar domínio (sslip.io)

O [sslip.io](https://sslip.io) transforma o IP da sua VM em um domínio. Se o IP é
`129.80.12.34`, o domínio é `129.80.12.34.sslip.io`.

Edite o Caddyfile:

```bash
nano deploy/Caddyfile
```

Troque a primeira linha por:

```
129.80.12.34.sslip.io {
	reverse_proxy 127.0.0.1:4174 {
		flush_interval -1
	}
}
```

Ative:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sleep 10
curl -s https://129.80.12.34.sslip.io/api/health
```

Se retornar `{"ok":true,...}`, o backend está público e com TLS. **Guarde esta URL** — ela será o
`BACKEND_URL` no Vercel.

> **Alternativa:** se preferir não expor o IP, use um **Cloudflare Tunnel** (`cloudflared`) —
> ele cria uma URL `https://…trycloudflare.com` sem abrir portas. O restante do guia é igual:
> use essa URL como `BACKEND_URL`.

---

## Passo 7 — Publique a interface no Vercel

1. Acesse <https://vercel.com/new> e importe o seu repositório.
2. **Root Directory:** deixe a raiz do repositório. O `vercel.json` já configura tudo
   (instalação, build e o proxy `/api`).
3. Em **Environment Variables**, adicione (para *Production* e *Preview*):

| Nome | Valor |
|---|---|
| `BACKEND_URL` | `https://129.80.12.34.sslip.io` (sem barra no fim) |
| `TOOLKIT_TOKEN` | o mesmo segredo do Passo 2 |

4. Clique em **Deploy**. Ao terminar, abra `https://<seu-app>.vercel.app`.

> O Vercel Hobby é para uso pessoal — este é um projeto pessoal, então está de acordo.

---

## Passo 8 — Teste de ponta a ponta

No **celular**, abra o app do Vercel e confira:

- [ ] A lista de atividades carrega.
- [ ] Abrir uma atividade mostra o enunciado/arquivos.
- [ ] Gerar um rascunho de IA funciona (precisa da `OPENAI_API_KEY`).
- [ ] O botão **Atualizar** dispara o scrape e mostra o progresso.

Se a lista não carregar, veja **Solução de problemas** abaixo.

---

## Passo 9 — Atualização automática diária

Na VM:

```bash
echo 'TOOLKIT_TOKEN=<mesmo segredo>' | sudo tee /etc/lxp-toolkit.env
sudo chmod 600 /etc/lxp-toolkit.env
sudo cp deploy/refresh.service deploy/refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now refresh.timer
systemctl list-timers refresh.timer
```

Pronto: todo dia às **06:00** (horário da VM) o conteúdo é atualizado sozinho. Se a VM estiver
desligada nesse horário, o `Persistent=true` roda assim que ela voltar.

---

## Passo 10 — Atualizar o código depois

**Backend (VM):**

```bash
cd ~/lxp-toolkit && git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

**Frontend:** basta dar `git push` — o Vercel republica sozinho.

---

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `curl .../api/health` não responde na VM | `docker compose ... logs app`. O app só sobe depois do Postgres. |
| HTTPS não emite o certificado | Portas 80/443 abertas na VCN **e** no `iptables` (Passo 4)? O Caddy precisa da 80 para o desafio. |
| App carrega mas a lista fica vazia / erro 502 | `BACKEND_URL` errado (sem `https://`, com barra no fim) ou `TOOLKIT_TOKEN` diferente do backend. |
| Erro `401` no navegador | `TOOLKIT_TOKEN` do Vercel ≠ do backend. Corrija e faça *Redeploy*. |
| Portal pede reCAPTCHA no scrape | Rode de casa: `HEADFUL=true npm run dump`, ou configure proxy. |
| Upload de arquivo grande falha | Limite de ~4,5 MB do Vercel. Envie pela VM. |
| IA demora e dá timeout | Geração muito longa (limite 60 s no Hobby). Tente de novo ou encurte. |
| Oracle suspende a conta por inatividade | O cron diário mantém a VM ativa. |
| Quero ver o que falta localmente | `npm run doctor`. |

---

## Segurança (checklist)

- [ ] Só as portas **22, 80, 443** abertas.
- [ ] `/etc/lxp-toolkit.env` com `chmod 600`.
- [ ] `.env` e `deploy/.env.prod` **nunca** commitados.
- [ ] `TOOLKIT_TOKEN` forte e igual nos 3 lugares.
- [ ] `OPENAI_API_KEY` só na VM (nunca no Vercel, exceto se necessário — ela não precisa estar lá).
- [ ] Faça backup do banco de tempos em tempos (veja `agent-docs/11-operations.md`).

---

## Custos e limites

| Serviço | Limite gratuito | Observação |
|---|---|---|
| Vercel Hobby | 100 GB de banda, funções até 60 s | uso pessoal; proxy de `/api` e `/scraped` |
| Oracle Always Free | 4 OCPU / 24 GB Arm, 200 GB | cartão só para verificação; pode suspender contas ociosas |
| OpenAI | pago por uso | só gera rascunhos; o resto funciona sem |

---

## E se eu estiver sem internet no colégio?

A nuvem não resolve isso — se tudo externo está bloqueado, nem o Vercel abre. Mas o app foi feito
para funcionar **localmente** depois de um scrape feito em casa:

```bash
npm run db:up
SKIP_SYNC=1 npm run dev      # http://localhost:5174
```

O `SKIP_SYNC=1` pula o scrape; o app lê o Postgres e o `scraped/` que já estão no seu notebook.

---

## Próximos passos

- Referência técnica completa: [`DEPLOY.md`](./DEPLOY.md)
- Arquitetura do produto: [`agent-docs/09-app-architecture.md`](./agent-docs/09-app-architecture.md)
- Deploy e limites: [`agent-docs/10-deployment.md`](./agent-docs/10-deployment.md)
- Operação do dia a dia: [`agent-docs/11-operations.md`](./agent-docs/11-operations.md)
