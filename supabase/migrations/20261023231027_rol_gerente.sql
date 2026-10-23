-- Rol de solo lectura para gerentes. Va solo en esta migración porque un valor
-- nuevo de enum no se puede usar en la misma transacción en que se agrega.
alter type public.rol_usuario add value 'gerente';
