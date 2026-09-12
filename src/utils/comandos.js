// Los comandos se escriben en español, que es lo que habla la gente del
// evento. Los nombres en inglés quedan como alias porque ya estaban en uso y
// mantenerlos no cuesta nada.
const ALIAS = {
  saldo: 'balance',
  enviar: 'transfer',
  historial: 'history',
  ayuda: 'help',
  nombre: 'register',
  emitir: 'emit',
  usuarios: 'users',
  contenido: 'content',
  nuevopin: 'resetpin',
};

// Traduce un alias a su nombre interno. Es imprescindible resolverlo ANTES de
// mirar qué comandos exigen clave de tesorero: si el candado comparara contra
// el nombre escrito, /emitir se lo saltaría por no llamarse "emit".
function canonico(nombre) {
  return ALIAS[nombre] || nombre;
}

module.exports = { ALIAS, canonico };
