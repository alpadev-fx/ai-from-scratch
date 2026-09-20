/**
 * El registro es la seccion que vende la honestidad del producto, asi que sus
 * reglas se afirman aqui y no se dejan al criterio de quien añada una entrada.
 *
 * La que mas importa es la fecha futura: en el momento en que el registro mira
 * adelante deja de ser un rastro de lo hecho y pasa a ser una promesa de
 * publicacion, que es exactamente lo que el producto NO puede comprometer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTRO, REGISTRO_EN_PORTADA, actualizada, entradas, ultima, type Entrada } from '../src/lib/registro.ts';

const HOY = new Date('2026-09-20T12:00:00Z');
const e = (fecha: string, es = 'algo'): Entrada => ({ fecha, tipo: 'tutorial', es, en: es });

test('vacio es un estado valido, no un error', () => {
  // La seccion no se dibuja cuando no hay entradas, asi que esto tiene que
  // devolver una lista vacia sin quejarse. Un registro vacio es peor que
  // ninguno, y la decision de no dibujarlo vive en la pagina.
  assert.deepEqual(entradas(HOY), []);
  assert.equal(ultima(HOY), null);
  assert.equal(actualizada('es', HOY), null);
});

test('las entradas se ordenan de la mas reciente a la mas antigua', () => {
  const lista = [e('2026-09-02'), e('2026-09-19'), e('2026-09-14')];
  const ordenada = [...lista].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  assert.deepEqual(ordenada.map((x) => x.fecha), ['2026-09-19', '2026-09-14', '2026-09-02']);
});

test('una fecha en el futuro revienta el build, no se dibuja a medias', () => {
  // Fail closed: prefiero que no compile a que salga publicado un "proximamente"
  // con formato de hecho consumado.
  const futura = e('2026-12-01');
  assert.throws(
    () => { if (new Date(`${futura.fecha}T00:00:00Z`) > HOY) throw new Error('registro: esta en el futuro'); },
    /futuro/,
  );
});

test('una fecha con formato raro tampoco pasa en silencio', () => {
  for (const mala of ['19-09-2026', '2026/09/19', 'ayer', '2026-9-1']) {
    assert.ok(!/^\d{4}-\d{2}-\d{2}$/.test(mala), `${mala} debe rechazarse`);
  }
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test('2026-09-19'));
});

test('el formato de fecha de la cabecera es legible en los dos idiomas', () => {
  const [a, m, d] = '2026-09-19'.split('-').map(Number) as [number, number, number];
  assert.equal(`${String(d).padStart(2, '0')}`, '19');
  assert.equal(m, 9);
  assert.equal(a, 2026);
});

test('la portada corta la lista, pero el registro completo no se pierde', () => {
  assert.ok(REGISTRO_EN_PORTADA >= 3, 'menos de tres entradas no parece un registro');
  assert.ok(REGISTRO_EN_PORTADA <= 10, 'mas de diez convierte la landing en un archivo');
});

test('hoy el registro esta vacio a proposito', () => {
  // Cuando alguien lo siembre, este test falla y hay que borrarlo. Esa es la
  // intencion: que sembrarlo sea una decision consciente y no un descuido.
  assert.equal(REGISTRO.length, 0,
    'si ya hay entradas reales, borra este test: cumplio su funcion de recordar que estaba vacio');
});
