# Flowboard

Kanban colaborativo em português, feito como site estático com Firebase Authentication e Cloud Firestore.

## Recursos

- Cadastro e login com e-mail e senha.
- Quadros privados e compartilhados por convite de uma conta já cadastrada.
- Papéis OWNER, EDITOR e VIEWER; as regras do Firestore também bloqueiam gravações de leitores.
- Tarefas com responsável, prioridade, prazo, etiquetas, story points, critérios de aceite e Definition of Done.
- Backlog, colunas configuráveis, arrastar e soltar, sprints e histórico de atividades.
- Página individual de tarefa com checklist e comentários.
- Migração única de tarefas legadas da conta para um quadro pessoal.

O convite procura o e-mail no diretório de contas do Flowboard. A pessoa convidada precisa se cadastrar antes; o sistema não envia e-mails.

## Configuração do Firebase

1. Em Firebase Console, habilite Authentication com o provedor E-mail/senha e crie um banco Cloud Firestore.
2. Confira `firebase-config.js` e use a configuração do projeto Firebase pretendido.
3. Publique o conteúdo de `firestore.rules` na página **Firestore Database → Regras** do Firebase Console. Alternativamente, nesta pasta, execute `firebase deploy --only firestore --project SEU_PROJECT_ID` usando o Firebase CLI autenticado.
4. Em **Authentication → Settings → Authorized domains**, adicione o domínio de produção e o domínio local que usar para testes.

Sem publicar as regras, a interface pode carregar, mas as operações de dados serão negadas. Não substitua as regras por acesso público.

## Publicação

O `netlify.toml` da raiz do repositório publica a pasta `kanban-main` e reescreve rotas como `/tasks/{id}` para `index.html`. Conecte o repositório ao Netlify e mantenha a raiz do projeto como diretório-base. Depois do deploy, cadastre o domínio atribuído pelo Netlify nos domínios autorizados do Firebase.

Para executar localmente, sirva esta pasta por HTTP (por exemplo, com a extensão Live Server do VS Code). O carregamento por `file://` não é suportado por causa dos módulos JavaScript.

## Permissões e limitações

| Ação | OWNER | EDITOR | VIEWER |
| --- | --- | --- | --- |
| Ler quadros, tarefas, comentários e histórico | Sim | Sim | Sim |
| Criar/editar tarefas, comentar e gerenciar sprints | Sim | Sim | Não |
| Convidar, alterar papéis e remover membros | Sim | Não | Não |
| Configurar colunas, limites WIP e excluir dados | Sim | Não | Não |

As regras são a autoridade para acesso por papel. O limite WIP também é verificado pela interface ao criar ou mover tarefas; o Firestore Rules não consegue contar documentos de uma coluna, então esse limite não é garantido contra gravações concorrentes ou chamadas diretas ao Firestore. Para garantia estrita, é necessário mover as gravações de tarefas para uma Cloud Function transacional.

## Verificação manual recomendada

1. Crie duas contas com e-mails diferentes e um quadro na primeira.
2. Convide a segunda conta como VIEWER e confirme que ela vê o quadro, mas não consegue alterar tarefas.
3. Troque o papel para EDITOR e confirme criação, edição, movimentação, comentários e checklist.
4. Remova a segunda conta e confirme que o quadro deixa de aparecer para ela.
5. Abra `/tasks/{id}` diretamente em uma nova aba e teste o retorno ao quadro.
6. Configure WIP, tente exceder o limite pela interface e confirme que a operação é recusada.

As permissões principais também podem ser verificadas localmente com Node.js 18+ e o Firebase CLI: `firebase emulators:exec --only auth,firestore --project demo-flowboard "node tests/firestore-rules-smoke.js"`.
