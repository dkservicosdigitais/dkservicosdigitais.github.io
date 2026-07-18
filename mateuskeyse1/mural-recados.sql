-- ============================================================
-- MURAL DE RECADOS — Casamento Mateus & Keyse
-- Cole este script COMPLETO no SQL Editor do Supabase e clique RUN
-- ============================================================

create extension if not exists pgcrypto;

-- Tabela dos recados
create table if not exists recados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  mensagem text not null,
  token_hash text not null,
  criado_em timestamptz default now()
);

-- Segurança: visitantes só podem LER os recados.
-- Escrever, editar e excluir só pelas funções seguras abaixo.
alter table recados enable row level security;

drop policy if exists "ler recados" on recados;
create policy "ler recados" on recados for select using (true);

-- Esconde a coluna do token dos visitantes
revoke select on recados from anon, authenticated;
grant select (id, nome, mensagem, criado_em) on recados to anon, authenticated;

-- Enviar recado
create or replace function enviar_recado(p_nome text, p_mensagem text, p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(length(trim(p_nome)),0) < 1 or coalesce(length(trim(p_mensagem)),0) < 1
     or length(p_mensagem) > 600 or coalesce(length(p_token),0) < 16 then
    raise exception 'dados inválidos';
  end if;
  insert into recados (nome, mensagem, token_hash)
  values (left(trim(p_nome),60), left(trim(p_mensagem),600),
          encode(digest(p_token,'sha256'),'hex'))
  returning id into v_id;
  return v_id;
end $$;

-- Corrigir recado (só quem tem o token daquele recado)
create or replace function editar_recado(p_id uuid, p_token text, p_mensagem text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_mensagem)),0) < 1 or length(p_mensagem) > 600 then
    raise exception 'mensagem inválida';
  end if;
  update recados set mensagem = left(trim(p_mensagem),600)
  where id = p_id and token_hash = encode(digest(p_token,'sha256'),'hex');
  return found;
end $$;

-- Excluir recado (só quem tem o token daquele recado)
create or replace function excluir_recado(p_id uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from recados
  where id = p_id and token_hash = encode(digest(p_token,'sha256'),'hex');
  return found;
end $$;
