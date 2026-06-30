# Controle do Passe Uber

Sistema online simples para controlar se o passe da Uber de 24h ou 72h está compensando.

Agora o sistema salva os dados no Supabase/Postgres, então não precisa de disco persistente no Render.

Ele salva:

- passe de 24h ou 72h;
- valor do passe;
- data e hora de início;
- data e hora final automática;
- ganho bruto lançado;
- quantidade de corridas;
- km rodado;
- custo por km;
- líquido sem km;
- líquido com km;
- porcentagem que o passe representa;
- histórico diário, semanal e mensal;
- exportação CSV.

## Como rodar localmente

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Variáveis de ambiente

```text
PORT=3000
DATABASE_URL=sua_url_do_supabase_postgres
APP_PIN=1234
```

`APP_PIN` é recomendado para proteger o app. Se não configurar, o app fica sem senha.

Para rodar com banco local sem SSL, use também:

```text
PGSSLMODE=disable
```

No Supabase, deixe sem `PGSSLMODE=disable`, porque o servidor já tenta conectar com SSL.

## Render

Configuração recomendada:

```text
Build Command: npm install
Start Command: npm start
```

Variáveis no Render:

```text
NODE_ENV=production
DATABASE_URL=cole_a_connection_string_do_supabase
APP_PIN=crie_um_pin_seguro
```

Não precisa criar Persistent Disk no Render. O banco fica no Supabase.

## Como pegar a DATABASE_URL no Supabase

No Supabase, crie um projeto e copie a connection string do Postgres. Ela geralmente fica em:

```text
Project Settings > Database > Connection string
```

Use a URL de conexão do Postgres no Render como `DATABASE_URL`.

O sistema cria automaticamente as tabelas `sessions` e `entries` quando o servidor inicia.

## Regras de cálculo

Porcentagem do passe:

```text
valor do passe / ganho bruto * 100
```

Líquido sem km:

```text
ganho bruto - valor do passe
```

Líquido com km:

```text
ganho bruto - valor do passe - (km rodado * custo por km)
```

Status:

- acima de 25%: pesado demais;
- entre 20% e 25%: ainda pesado;
- entre 15% e 20%: no limite;
- abaixo de 15%: mais saudável.
