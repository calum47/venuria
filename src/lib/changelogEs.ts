/**
 * Spanish text of the release notes in `changelog.ts`, keyed by entry id.
 *
 * The English entry stays the source (it is what an author writes in the same commit as the
 * feature); this file adds the Spanish wording. An entry without a Spanish version here is
 * shown in English, and `npm run check:messages` fails until it has one.
 *
 * Same rules as the English notes: written for the person using the app, no internals.
 * Terms follow the interface (Ajustes, Mi equipo, Mi inventario, Cronograma, Guion del día…).
 */
export type ChangelogText = { title: string; items: string[] }

export const CHANGELOG_ES: Record<string, ChangelogText> = {
  '2026-11-28-rsvp-wide-layout': {
    title: 'Página de confirmación: más ancha en pantallas grandes y ajustada a su contenido',
    items: [
      'La página de confirmación de los invitados ahora ocupa cerca del 90 % del ancho en tabletas y ordenadores, y todo el ancho en el móvil (sin esquinas redondeadas ni márgenes laterales).',
      'Cada bloque es tan ancho como lo que contiene: el mensaje de bienvenida, el formulario de respuesta y un programa corto se quedan en una columna centrada, mientras que un programa día a día largo, varias fotos u hoteles y el mapa se extienden. Cuantas más entradas, fotos u hoteles, más espacio ocupan.',
    ],
  },
  '2026-11-28-rsvp-big-day': {
    title: 'Página de confirmación: sección «El gran día» con el programa y el mapa',
    items: [
      'El programa del día de la boda y el botón del mapa del lugar están ahora juntos en una sola sección, «El gran día». Puedes cambiar su título (por ejemplo, «Sábado» o «La ceremonia»); los invitados lo ven en su idioma.',
      'La tarjeta del código de vestimenta ya no aparece en la página, porque ya se muestra como etiqueta en las entradas del día a día. El enlace del mapa del lugar se define ahora en la misma sección que el programa.',
    ],
  },
  '2026-11-28-rsvp-day-by-day': {
    title: 'Página de confirmación: programa día a día y programa del día de la boda',
    items: [
      'El bloque de detalles de la página de confirmación ahora es un programa «Día a día». Añade una entrada por cada momento del fin de semana con su día, horario, título, lugar, una breve descripción y una etiqueta (por ejemplo, el código de vestimenta). Los invitados las ven ordenadas por día y hora.',
      'El programa del día de la boda es ahora una sección propia, con su propio interruptor y su lugar en el orden de secciones. Las páginas que ya tenían un programa lo siguen mostrando.',
      'El texto que escribiste antes de que existieran las traducciones se traduce en cuanto abres el contenido de la página de confirmación, y hay un botón «Traducir ahora». Así, los invitados que cambian de idioma ven tu texto en ese idioma.',
    ],
  },
  '2026-11-28-rsvp-translations': {
    title: 'Página de confirmación: tu texto también cambia de idioma',
    items: [
      'Cuando un invitado cambia el idioma en la página de confirmación, el texto que escribiste cambia también: el mensaje de bienvenida, el programa, el código de vestimenta, el texto de la zona, los pies de foto y las descripciones y notas de reserva de los hoteles.',
      'Las traducciones (español, inglés y francés) se hacen automáticamente al guardar. Puedes escribir en cualquiera de ellos. Los nombres y las direcciones se quedan como los escribiste. Abre Vista previa y cambia el idioma para revisar el resultado.',
      'Si no se puede hacer una traducción, verás un aviso y los invitados verán tu texto original en todos los idiomas hasta que vuelvas a guardar.',
      'Mejora pequeña: un poco más de espacio entre el panel del enlace de confirmación y la fila de añadir invitado.',
    ],
  },
  '2026-11-28-rsvp-map': {
    title: 'Página de confirmación: mapa opcional del lugar y los hoteles',
    items: [
      'Ahora puedes mostrar en la página de confirmación de los invitados un mapa con el lugar y los hoteles que recomiendas. Viene desactivado: actívalo en Mapa, dentro del contenido de la página.',
      'No hay que marcar nada a mano: cada sitio se encuentra a partir de su enlace de Google Maps o, si no hay, de su dirección. Los hoteles tienen un nuevo campo opcional de enlace de Google Maps y el lugar puede tener una dirección opcional.',
      'Los invitados tocan un hotel en el mapa (o «Ver en el mapa» en su tarjeta) para ver sus datos, la distancia en línea recta al lugar y botones para abrirlo en Google Maps o visitar su web, cada uno en una pestaña nueva.',
      'Si no se encuentra un sitio, verás un aviso junto a él y simplemente no aparece en el mapa.',
    ],
  },
  '2026-11-28-table-closeups': {
    title: 'Exportación PDF: mesas en detalle y otras mejoras',
    items: [
      'La exportación a PDF incluye la nueva sección «Vista detallada de mesas»: cada mesa ampliada con sus sillas numeradas y el invitado sentado en cada una, cuatro mesas por página. El plano completo de la sala sigue incluido.',
      'El resumen indica cuántos artículos puede cubrir realmente el local y muestra «Sin cubrir todavía» para el resto, en lugar de contar el local como ilimitado.',
      'La lista de materiales del cronograma muestra ahora lo que has solicitado a proveedores vinculados, con su estado de confirmación.',
      'Las listas de proyectos dicen «Creado por: Nombre (Tú)» y «Asignado a: …», y los desplegables de edad y confirmación de la lista de invitados vuelven a mostrar sus etiquetas.',
      'Se ha quitado la opción de texto de pie de página de los ajustes de estilo de exportación.',
    ],
  },
  '2026-11-28-item-requests-planner': {
    title: 'Lo que alquilas a un proveedor ahora es una solicitud que el proveedor responde',
    items: [
      'Cuando eliges cuántas sillas, mesas o platos alquilar a un proveedor, se convierte en una solicitud. El proveedor la acepta, acepta solo parte de la cantidad o la rechaza.',
      'El resumen del proyecto muestra la respuesta junto a cada proveedor: pendiente, confirmado (o confirmadas N de M) o rechazado. Las cantidades pendientes y confirmadas cuentan como reservadas, así que no se prometen las mismas unidades dos veces en una fecha.',
      'Pedir artículos a un proveedor también lo añade al proyecto y a tu lista de proveedores del cronograma.',
    ],
  },
  '2026-11-28-item-requests-vendor': {
    title: 'Solicitudes: responde a lo que te piden los planificadores',
    items: [
      'La nueva página de Solicitudes muestra lo que te piden los planificadores, con el proyecto, la fecha y cuántas unidades te quedan libres ese día. Acepta todo, acepta parte o rechaza.',
      'Dentro de un proyecto, la página de Materiales muestra lo que se te ha solicitado y tu respuesta.',
    ],
  },
  '2026-11-28-vendor-in-timetable-fix': {
    title: 'Los proveedores que añades aparecen siempre en la lista del cronograma',
    items: [
      'Corregido: un proveedor añadido a un proyecto podía faltar en la lista de proveedores del cronograma y del guion del día. Ahora la lista se rellena a partir del equipo del propio proyecto.',
    ],
  },
  '2026-11-28-editor-back-and-settings': {
    title: 'Volver al panel del proyecto desde el editor 2D',
    items: [
      'La barra del editor 2D tiene un enlace «← Proyecto» que te lleva directamente al panel del proyecto.',
      'Si tu acceso también gestiona una empresa proveedora, sus datos de contacto (persona de contacto, teléfono, correo y cuentas de Instagram) están en tu página de Ajustes.',
    ],
  },
  '2026-11-28-item-sources': {
    title: 'Elige de dónde se alquila cada artículo',
    items: [
      'En el resumen del proyecto eliges cuántas unidades de cada artículo (sillas, mesas, platos…) alquilas a cada proveedor. Lo que no alquiles sale del local.',
      'Cada proveedor muestra cuántas le quedan libres en la fecha de tu evento, descontando lo que ya ha comprometido para otros eventos ese mismo día.',
    ],
  },
  '2026-11-28-map-fit-and-instagrams': {
    title: 'El plano 2D se abre ajustado a la pantalla; varias cuentas de Instagram',
    items: [
      'El plano 2D se abre ahora alejado, con toda la sala centrada en pantalla. El botón del porcentaje de zoom lo vuelve a ajustar.',
      'Los proveedores pueden indicar varias cuentas de Instagram en Ajustes y marcar una como la cuenta principal de la empresa.',
    ],
  },
  '2026-11-28-vendor-contacts-planner': {
    title: 'Los proveedores que añades aparecen en tu cronograma con sus datos de contacto',
    items: [
      'Un proveedor que añades a un proyecto aparece ahora en tu lista de proveedores, listo para etiquetarlo en los bloques del cronograma. Sus datos de contacto se rellenan con lo que el proveedor ha introducido en sus propios Ajustes y se actualizan solos cuando los cambia.',
      'Los proveedores que no tienen cuenta de Venuria se siguen añadiendo igual que antes, con «+ Nuevo proveedor».',
    ],
  },
  '2026-11-28-vendor-contacts-vendor': {
    title: 'Ajustes: tus datos de contacto',
    items: [
      'La nueva página de Ajustes guarda tu persona de contacto, teléfono, correo e Instagram. Los planificadores que te añaden a un proyecto los ven automáticamente en su cronograma y su guion del día, y se mantienen al día cuando los cambias.',
    ],
  },
  '2026-11-28-vendors-on-projects-planner': {
    title: 'Añade proveedores a un proyecto',
    items: [
      'En la página de un proyecto, «Proveedores de este proyecto» te permite añadir a los proveedores que ayudan en ese evento. Un proveedor añadido puede consultar los materiales, el plano 2D, el cronograma y el guion del día, solo en lectura. Nunca ve invitados, pagos ni documentos.',
      'Puedes quitar a un proveedor en cualquier momento y su acceso termina al instante.',
      'Si tú también eres proveedor, un enlace «Proyectos de proveedor» en este menú muestra los proyectos a los que te han añadido.',
    ],
  },
  '2026-11-28-vendors-on-projects-vendor': {
    title: 'Consulta los proyectos en los que trabajas',
    items: [
      'Cuando un planificador te añade a un proyecto, aparece en «Proyectos en los que participas» (un enlace «Proyectos de proveedor» en el menú de planificación, o en tu página de proveedor). Puedes consultar sus materiales, el plano 2D, el cronograma y el guion del día, solo en lectura.',
    ],
  },
  '2026-11-28-3d-hidden-shorter-tour': {
    title: 'Vista 3D oculta por ahora; recorrido más corto',
    items: [
      '«Ver en 3D» se ha quitado del editor mientras se termina la función. Volverá más adelante.',
      'El recorrido guiado es más corto (17 pasos en lugar de 29) y el proyecto de práctica incluye ahora un cronograma y un guion del día de ejemplo para que veas cómo quedan.',
    ],
  },
  '2026-11-28-last-page-and-practice-project': {
    title: '«Último proyecto» recuerda la página; el recorrido tiene un proyecto de práctica',
    items: [
      '«Último proyecto» del menú te lleva ahora a la última página que visitaste en ese proyecto (editor, invitados, pagos, cronograma, guion del día o resumen), y no solo a la vista general del proyecto.',
      'El recorrido guiado (Ajustes → Tutorial) incluye ahora el editor. Un planificador sin proyectos recibe un proyecto de práctica, «Alex & Sam (ejemplo)», donde colocar una mesa y añadir invitados. Quienes ya tienen proyectos solo reciben explicaciones: el recorrido nunca modifica trabajo real.',
    ],
  },
  '2026-11-28-guided-tour': {
    title: 'Recorrido guiado para planificadores',
    items: [
      'Un recorrido paso a paso explica ahora las páginas principales: proyectos, el editor, invitados y asistencia, pagos, cronograma, inventario, equipo y ajustes. Puedes empezarlo cuando quieras desde Ajustes → Tutorial.',
    ],
  },
  '2026-11-28-stronger-passwords': {
    title: 'Contraseñas más seguras',
    items: [
      'Las contraseñas nuevas o cambiadas necesitan al menos 8 caracteres, con una mayúscula, un número y un carácter especial (por ejemplo ! @ # $ % &). Tu contraseña actual sigue funcionando.',
      '¿Has olvidado tu contraseña? Pídele una temporal a tu administrador de Venuria y luego cámbiala en Ajustes.',
    ],
  },
  '2026-11-28-new-projects-public': {
    title: 'Los proyectos nuevos son visibles para tu equipo',
    items: [
      'Los proyectos nuevos empiezan ahora como Públicos: todo tu equipo puede abrirlos para verlos, pero solo pueden editarlos quien los creó, las personas asignadas y los líderes y gerentes. Usa «Público — hacer privado» en un proyecto para restringirlo.',
    ],
  },
  '2026-11-27-auto-arrange-dining-only': {
    title: 'La autodisposición solo ofrece mesas de comedor',
    items: [
      'Las mesas de cóctel y las mesas altas ya no aparecen en la autodisposición: esta organiza los asientos de la cena, así que solo se pueden elegir mesas de comedor.',
    ],
  },
  '2026-11-27-auto-arrange-even-spread': {
    title: 'La autodisposición reparte las mesas de forma uniforme',
    items: [
      'Las mesas se reparten ahora de forma uniforme por el suelo libre, en lugar de agruparse en el centro de la sala.',
      'Con «Equilibrar en torno a la mesa de los novios» activado, las mesas se colocan en parejas simétricas a ambos lados de la línea que pasa por la mesa de los novios, y una mesa sobrante queda sobre la propia línea.',
    ],
  },
  '2026-11-27-auto-arrange-flexible': {
    title: 'La autodisposición ya no exige que las plazas coincidan con tu lista de invitados',
    items: [
      'Elige cualquier combinación de mesas y pulsa Disponer: da igual que haya menos o más plazas que invitados. El total de plazas sigue mostrando cómo te encuentras, solo como orientación.',
      'Cada mesa se coloca con su máximo de sillas, así que luego puedes quitar las que no necesites.',
      'Haz clic en una silla o mesa y pulsa Supr (Retroceso en Mac) para quitarla. Quitar una silla deja el resto de la mesa como estaba.',
      'Hacer clic en una zona vacía del plano vuelve a deseleccionar.',
    ],
  },
  '2026-11-27-rotation-and-seating': {
    title: 'Editor: rotación y asientos en un solo lugar',
    items: [
      'El cuadro «Colocación» se llama ahora «Rotación y asientos». Gira una mesa o un artículo a cualquiera de 8 ángulos, incluidas las diagonales (45°, 135°, 225°, 315°).',
      'Los lados con sillas, añadir sillas y el arrastre simétrico están ahora en el mismo cuadro, justo debajo de los botones de rotación.',
      'Los cuadros de posición X / Y ya no existen: arrastra los artículos por el plano para colocarlos.',
    ],
  },
  '2026-11-27-editor-pan-select': {
    title: 'Editor: más fácil de mover con el trackpad',
    items: [
      'Arrastra sobre una zona vacía del plano para desplazarte por él, sin necesidad de clic derecho.',
      'Para seleccionar varias mesas o sillas, mantén Ctrl (o ⌘ / Mayús) y arrastra un recuadro a su alrededor.',
      'Pellizca o desplaza para hacer zoom.',
    ],
  },
  '2026-11-27-stock-tiles': {
    title: 'Mi inventario: cifras más claras',
    items: [
      'La parte superior de Mi inventario muestra ahora lo que te ha costado tu inventario (a coste medio), el beneficio de todo lo vendido hasta ahora, los productos que se agotan y cuántos artículos reutilizables están en manos de clientes.',
      'Cada producto muestra su propio coste medio, precio de venta, margen y cuántas unidades has vendido.',
    ],
  },
  '2026-11-27-vendor-account': {
    title: 'Planificación y Proveedor con un solo acceso',
    items: [
      'Si eres planificador y además diriges un negocio de proveedor (mesas y sillas de alquiler, productos que vendes), tu cuenta puede ahora hacer ambas cosas. Usa el interruptor Planificación ⇄ Proveedor de la parte superior para pasar de una a otra, con el mismo correo y la misma contraseña.',
      'En la parte de Proveedor gestionas lo que puedes alquilar y ves tu inventario de productos, que es el mismo que Mi inventario en la parte de planificación: una venta registrada en una aparece en la otra.',
      'Otros planificadores pueden encontrar tus mesas y sillas de alquiler cuando planifican. Tus productos y precios siguen siendo privados para tu equipo.',
    ],
  },
  '2026-11-27-projects-assignees-payments': {
    title: 'Asigna a varias personas y consulta todos los pagos',
    items: [
      'Un proyecto puede asignarse ahora a tantos compañeros como quieras. Los líderes y gerentes lo configuran en Editar, dentro de Mis proyectos, y pueden filtrar toda la lista por compañero.',
      'Mis proyectos muestra ahora todos los pagos, pagados y pendientes, como calendario (por defecto) o como lista. Incluye los proyectos que creaste o que tienes asignados; los líderes y gerentes ven todo el equipo.',
      'Los proyectos nuevos empiezan como Privados. Cualquier compañero puede abrir un proyecto Público, pero si no estás asignado puedes mirarlo sin cambiar nada, y Pagos y documentos queda oculto.',
    ],
  },
  '2026-11-27-export-look-and-logo': {
    title: 'Tu propio aspecto y logotipo en las exportaciones',
    items: [
      'Los gerentes pueden ahora dar estilo a los PDF que exporta el equipo desde Ajustes: tipo de letra (siete a elegir), tamaño del título y del texto, color de acento, espaciado y texto del pie, con una vista previa en directo creada a partir de uno de tus proyectos reales.',
      'Sube tu logotipo una vez y se imprimirá en todas las páginas del PDF, abajo a la izquierda o en el centro y con el tamaño que elijas. El JPG del plano también lo lleva. La marca de Venuria se imprime siempre abajo a la derecha.',
      'Las exportaciones de todo el equipo usan automáticamente el aspecto guardado.',
    ],
  },
  '2026-11-26-plan-export-jpg': {
    title: 'La exportación del plano ahora es un JPG',
    items: [
      'El botón «Exportar» del editor descarga ahora la sala como JPG con fondo blanco, en lugar de PNG. Los JPG pesan menos y se abren en cualquier sitio.',
    ],
  },
  '2026-11-26-stock-avg-cost-member-privacy': {
    title: 'Mi inventario: coste medio y precios ocultos a los miembros',
    items: [
      'El coste de un producto es ahora una media («Coste medio»): cada compra mezcla su precio en el coste, ponderado por la cantidad. Comprar 10 a 1,10 € y luego 30 a 0,80 € da 0,875 €.',
      'Los productos nuevos piden el precio de venta al crearlos; puedes cambiarlo después.',
      'Los miembros ya no ven costes, precios de venta, márgenes ni beneficios en ninguna parte de Mi inventario, y la pestaña Compras es solo para gerentes y líderes. La venta de un miembro se valora automáticamente.',
    ],
  },
  '2026-11-26-guest-multi-select': {
    title: 'Selecciona y elimina varios invitados a la vez',
    items: [
      'En la página de detalles de la lista de invitados, marca invitados con las nuevas casillas o usa la casilla de la parte superior de la tabla para marcar a todos los que se muestran.',
      'Aparece una barra con «Eliminar seleccionados…». Pide confirmación primero, y te pide escribir ELIMINAR si vas a quitar a todos los invitados del proyecto.',
    ],
  },
  '2026-11-21-table-settings-summary': {
    title: 'Platos, copas y velas en el resumen',
    items: [
      'El resumen del proyecto cuenta ahora lo que necesitan tus montajes de mesa (platos, cubiertos, copas, velas, flores) junto con las mesas y sillas, y muestra lo que falta respecto al inventario del espacio y de las empresas de alquiler.',
      'Los artículos que proceden de los montajes de mesa se marcan como «en mesas».',
    ],
  },
  '2026-11-21-table-settings-on-plan': {
    title: 'Los montajes de mesa se ven ahora en el plano',
    items: [
      'Los platos, cubiertos y copas se dibujan en cada silla, y las velas, jarrones y caminos de mesa por el centro de la mesa. Acércate con el zoom para ver el detalle.',
      'El panel de propiedades está más ordenado: secciones que se pueden plegar, botones +/− para las cantidades y artículos agrupados por tipo.',
    ],
  },
  '2026-11-21-table-settings': {
    title: 'Montajes de mesa: platos, copas, velas y flores',
    items: [
      'Selecciona una mesa y usa la nueva sección Montaje de mesa para elegir qué lleva: platos, cubiertos, copas, velas, flores.',
      'Guarda tus combinaciones habituales como plantillas, compartidas con todo tu equipo, y aplica una a una sola mesa o a todas las mesas de la sala. Las mesas de los novios, de cóctel y altas se montan una a una.',
      'Después de aplicarla, puedes cambiar cualquier mesa por separado sin afectar a las demás. Los artículos por plaza se cuentan según las sillas de esa mesa.',
    ],
  },
  '2026-11-21-rsvp-data-controller': {
    title: 'El nombre y el contacto de tu empresa en la página de asistencia',
    items: [
      'En Ajustes → Equipo, el gerente puede añadir ahora el nombre de la empresa y un correo de contacto. Los invitados los ven junto a la casilla de consentimiento de la página de asistencia, como responsable de sus datos y dirección para pedir verlos o eliminarlos.',
      'Sin nombre de empresa se muestra el nombre del equipo. Los ajustes de asistencia te lo recuerdan mientras no haya correo de contacto.',
    ],
  },
  '2026-11-21-project-names-and-delete': {
    title: 'Nombres de la pareja, eliminar proyectos y ajustes de asistencia',
    items: [
      'Los proyectos llevan ahora como título los nombres de la pareja. Añádelos o cámbialos desde la lista de proyectos o la página del proyecto; los proyectos sin nombres siguen mostrando el espacio.',
      'Puedes eliminar un proyecto desde su página (al final). Es permanente y solo puede hacerlo quien lo creó, un gerente o un líder.',
      'En los ajustes de asistencia puedes elegir el idioma en el que se abre la página y subir o bajar las secciones (datos, formulario de respuesta, zona, hoteles).',
      'En la parte de planificación, la barra superior del editor empieza ahora con el menú de Venuria, y el «modo invitados» se llama «Plano de mesas».',
    ],
  },
  '2026-11-21-rsvp-wedding-look': {
    title: 'Una página de asistencia más de boda',
    items: [
      'La página de asistencia para invitados se basa ahora en la fotografía: tu foto de portada ocupa la parte superior con los nombres encima, seguida de una nota de bienvenida, el programa, tus preguntas, la zona y los hoteles.',
      'Los nombres de la parte superior proceden de los nombres de la pareja del proyecto. Sin ellos, se muestra el nombre del espacio.',
      'La nota de bienvenida queda ahora debajo de los nombres, así que ya no hace falta escribirlos en ella.',
    ],
  },
  '2026-11-21-fresh-look': {
    title: 'Un aspecto nuevo y más suave',
    items: [
      'Venuria estrena aspecto: fondos marfil cálidos, esquinas suavemente redondeadas, un acento malva empolvado y una elegante tipografía con serifa para los títulos de página.',
      'La barra superior tiene ahora el logotipo de Venuria y funciona en el móvil: los enlaces pasan a su propia fila, que puedes deslizar.',
      'Los botones, las pestañas seleccionadas y los resaltados usan el nuevo color de acento. Nada se ha movido ni cambiado de nombre.',
    ],
  },
  '2026-11-21-notification-bell': {
    title: 'Campana de notificaciones',
    items: [
      'Una campana en la barra superior muestra ahora lo que requiere tu atención. No se envía ningún correo.',
      'Asistencia: los invitados que respondieron a través del enlace y no estaban en tu lista (o que vinieron como acompañante) aparecen por boda hasta que los marques como revisados.',
      'Pagos: desde 7 días antes del vencimiento, todo pago sin pagar aparece en la campana, y sigue apareciendo cada día, también después del vencimiento, hasta que lo marques como pagado. El número rojo vuelve una vez al día y desaparece al abrir la campana.',
    ],
  },
  '2026-11-21-rsvp-page-content': {
    title: 'Haz tuya la página de asistencia',
    items: [
      'La página de asistencia para invitados puede tener ahora una foto de portada, un programa, un código de vestimenta y un enlace al mapa.',
      'Añade una sección «Cómo llegar y la zona» con tu propio texto y hasta 6 fotos con pies de foto, e incluye hasta 8 hoteles recomendados con dirección, web, una nota de reserva, una breve descripción y una foto.',
      'Cada sección se puede desactivar sin perder lo que escribiste, y las secciones vacías no se muestran. Usa «Vista previa de la página» para ver exactamente lo que ven los invitados, incluso antes de activar el enlace.',
    ],
  },
  '2026-11-20-rsvp-link': {
    title: 'Enlace de asistencia para invitados',
    items: [
      'Cada proyecto tiene ahora un único enlace de asistencia que puedes enviar a todos tus invitados. Abre la lista de invitados y busca «Enlace de asistencia para invitados» en la parte superior para activarlo, fijar un último día para responder, añadir un texto de bienvenida y copiar el enlace.',
      'Los invitados escriben su nombre, lo cotejamos con tu lista y responden en español, inglés o francés: asisto, no asisto o quizá, además de necesidades dietéticas y un acompañante opcional. Nadie necesita una cuenta.',
      'La lista de invitados muestra cada respuesta, y puedes filtrar por Asisten, No asisten, Quizá o Pendientes. Los invitados que no están en tu lista y los acompañantes se añaden y se marcan como «Por revisar».',
      'El enlace solo recoge la primera respuesta de cada invitado. Para cambiar una respuesta, edítala en los detalles del invitado. Los invitados que declinan ya no cuentan como necesitados de asiento ni para el aforo de la sala.',
    ],
  },
  '2026-11-20-capacity-vendors-reusable': {
    title: 'Aforo de las salas, pagos con proveedores e inventario reutilizable',
    items: [
      'Las salas tienen ahora su propio aforo. La primera vez que abres una sala en un proyecto eliges si está Sentada o De pie, y la barra de herramientas muestra cuántas plazas (o invitados) estás usando frente al límite del espacio. Superarlo solo muestra un aviso: puedes continuar tras escribir una nota, y la nota aparece en el resumen de «qué ha cambiado» del proyecto.',
      'La página del proyecto muestra el aforo de cada zona junto a lo que has colocado en ella.',
      'Los pagos pueden usar ahora la lista de proveedores de tu equipo. Empieza a escribir el nombre de un proveedor y elígelo de la lista; los nombres que coinciden con un proveedor se vinculan automáticamente, y lo demás queda como texto escrito con una nota «no está en la lista de proveedores».',
      'Mi inventario: marca un producto como Reutilizable si vuelve tras cada boda. Una venta saca los artículos; más tarde, un gerente o líder confirma cuántos volvieron, de modo que se registran las pérdidas y puedes ver lo que está en manos de clientes.',
    ],
  },
  '2026-11-20-venue-capacity': {
    title: 'Fija el aforo de cada sala',
    items: [
      'En los ajustes de tus salas puedes indicar ahora cuántas personas caben en cada sala con montaje sentado y con montaje de pie. Los planificadores ven el límite correspondiente en sus proyectos y reciben un aviso si lo superan.',
    ],
  },
  '2026-11-16-timetable-rundown': {
    title: 'Cronograma y guion del día',
    items: [
      'Nuevo Cronograma en la página del proyecto: un calendario por horas para cada día del evento. Añade un día para la boda, la fiesta de bienvenida, el brunch, y cambia de uno a otro con las pestañas.',
      'Haz clic en un hueco vacío para añadir un bloque, arrastra un bloque hacia arriba o hacia abajo para moverlo, arrastra su borde inferior para cambiar su duración o haz clic en él para escribir las horas exactas. Los bloques pueden pasar de la medianoche y los que se solapan se colocan uno junto a otro.',
      'Etiqueta cada bloque con un proveedor de la lista de proveedores de tu equipo. Cada proveedor tiene un color, datos de contacto y un usuario de Instagram, compartidos por todo tu equipo.',
      'Nuevo Guion del día: el mismo programa como lista para el día de la boda, con los datos de contacto del proveedor, la persona responsable, notas y una lista de materiales. Las horas salen directamente del cronograma, así que nunca las escribes dos veces.',
      'Elige para cada entrada si se muestran el proveedor, su contacto y su Instagram, escoge uno o varios proveedores para listar, e imprímelo o guárdalo como PDF.',
      'Los cambios del cronograma aparecen en el resumen de «qué ha cambiado» para tus compañeros.',
    ],
  },
  '2026-11-16-stock-roles-seats-png': {
    title: 'Permisos del inventario, avisos de asiento y exportación a PNG',
    items: [
      'Mi inventario sigue ahora los roles del equipo: los gerentes y líderes pueden hacerlo todo; los miembros pueden ver el inventario, añadir pedidos y registrar los artículos usados en una boda.',
      'Los invitados sin asiento se marcan ahora como «Necesita asiento» en la lista de invitados y en la página del proyecto. Los bebés nunca se marcan. Si alguien no se va a sentar, descarta el aviso e indica el motivo; puedes recuperarlo en cualquier momento.',
      'En la lista de invitados del editor, pasa el cursor por un invitado y haz clic en «Editar datos» para abrir todos sus detalles en una pestaña nueva.',
      'El nuevo botón Exportar PNG de la barra del editor descarga la sala actual como imagen, tal como está dibujada: mesas, sillas, zonas y etiquetas, sin la cuadrícula ni los tiradores de selección.',
    ],
  },
  '2026-11-16-guest-list-details': {
    title: 'Detalles de la lista de invitados',
    items: [
      'Nueva página de detalles de la lista de invitados en la página del proyecto: todos los invitados en una tabla con su foto, familia, necesidades dietéticas, asiento y hotel. Búscalos o filtra por VIP, discursos, necesidades dietéticas o invitados sin asiento.',
      'Haz clic en un invitado para editarlo: añade una foto (se redimensiona en tu dispositivo y es privada para tu equipo), márcalo como VIP o como persona que da un discurso, y anota alergias y necesidades dietéticas.',
      'Vincula familias: pon a los padres y a sus hijos o bebés en una misma familia y ordena por «familias juntas» para verlos uno junto a otro.',
      'Anota dónde duerme cada invitado noche a noche, con un rango para varias noches a la vez.',
      'Los asientos se muestran aquí pero se siguen colocando en el editor. Los cambios en los invitados aparecen en el resumen de «qué ha cambiado» (las estancias en hoteles todavía no se registran).',
    ],
  },
  '2026-11-16-project-page-payments': {
    title: 'Página del proyecto y seguimiento de pagos',
    items: [
      'Al hacer clic en un proyecto de Mis proyectos se abre ahora primero una página del proyecto, con una tarjeta para cada parte: el editor, el resumen del plano y los pagos.',
      'Nueva página de Pagos y documentos: añade cada pago con su proveedor, importe y fecha de vencimiento, márcalo como pagado con la fecha en que se pagó, y ve de un vistazo lo que vence, está vencido o está pagado.',
      'Adjunta un recibo en PDF a cualquier pago, y guarda con el proyecto contratos en borrador u otros PDF (hasta 10 MB cada uno). Los archivos son privados para tu equipo.',
      'Cambia los pagos entre una lista y un calendario mensual: cada pago se sitúa en su fecha de vencimiento, coloreado según esté pagado, vencido o próximo a vencer, y al hacer clic en un día se muestran los pagos de ese día para editarlos.',
      'El botón «Último proyecto» de la barra superior abre ahora también la página del proyecto.',
      'Los cambios en los pagos aparecen en el resumen de «qué ha cambiado» para tus compañeros (solo etiquetas, nunca importes).',
    ],
  },
  '2026-09-18-stock-tracking': {
    title: 'Mi inventario: tu propio inventario',
    items: [
      'Nueva página Mi inventario: un lugar para tu inventario de venta (bolsas de bienvenida, detalles, artículos personalizados) totalmente separado del catálogo del plano.',
      'Pestaña Catálogo: añade productos con un emoji o una foto, precio de coste y de venta, alerta de existencias bajas y, opcionalmente, «Bajo demanda» para artículos hechos por encargo sin recuento de existencias.',
      'Las pestañas Compras y Ventas registran las entradas y salidas de inventario y mantienen tus existencias al día automáticamente. Una venta puede etiquetarse opcionalmente con una de tus bodas.',
      'La pestaña Pedidos reúne en un solo lugar todo lo que has encargado, con un sencillo estado pendiente/recibido.',
      'Compartido con todo tu equipo: todos ven y pueden editar el mismo inventario, sin copias separadas.',
    ],
  },
  '2026-09-18-project-sharing': {
    title: 'Proyectos de equipo, asignación y privacidad',
    items: [
      'Los proyectos se comparten ahora con tu equipo. Tu panel muestra Míos (creados por ti o asignados a ti) y Proyectos del equipo (todo lo público de tus compañeros).',
      'Los gerentes y líderes pueden asignar un proyecto a un compañero desde el panel Editar de la fila. Los proyectos asignados aparecen en Míos para esa persona.',
      'Cualquier proyecto puede hacerse privado por su creador (o por un gerente o líder). Los proyectos privados solo los ven el creador, la persona asignada y los gerentes y líderes.',
      'Al abrir un proyecto en el que ha trabajado otra persona, se muestra lo que ha cambiado desde la última vez que lo abriste.',
    ],
  },
  '2026-09-18-team-invites': {
    title: 'Invita a compañeros a tu equipo',
    items: [
      'Los gerentes de equipo pueden crear ahora enlaces de invitación desde Mi equipo. Envía el enlace a un compañero; crea su propio acceso y llega directamente a tu equipo.',
      'Elige si se une como Miembro (ve los proyectos públicos y los suyos) o como Líder de equipo (ve y asigna todos los proyectos).',
      'Los enlaces son de un solo uso y caducan a los 7 días. Los enlaces pendientes pueden revocarse desde Mi equipo.',
      'Los gerentes pueden cambiar el rol de un compañero o quitarlo. Quitar a alguien lo traslada a su propio equipo; no se elimina nada de lo suyo.',
    ],
  },
  '2026-09-18-teams-nav': {
    title: 'Navegación, Ajustes y Equipos',
    items: [
      'Una barra de navegación está ahora en todas las pantallas de planificación: Último proyecto, Mis proyectos, Mi equipo, Ajustes. En el editor, haz clic en ☰ Venuria para ver los mismos enlaces.',
      'Ahora perteneces a un equipo. Los planificadores que trabajan solos son un equipo de uno, así que nada cambia en el día a día, pero esta es la base para trabajar con compañeros, que llegará a continuación.',
      'Nueva página de Ajustes: actualiza tu nombre, cambia tu contraseña y, como gerente del equipo, cambia el nombre del equipo y fija su moneda.',
      'Nueva página Mi equipo que muestra quién forma parte de tu equipo y su rol.',
      'La página de inicio de sesión tiene una casilla «Recordarme». Desmárcala y se cerrará tu sesión al cerrar el navegador.',
    ],
  },
  '2026-09-18-event-dates': {
    title: 'Fechas del evento y fecha límite',
    items: [
      'Todo proyecto nuevo tiene ahora una fecha de evento. Tu panel ordena los proyectos del más próximo al más lejano con una cuenta atrás, y los eventos pasados bajan al final.',
      'Cada proyecto tiene también una fecha límite: el día en que el plano debe quedar cerrado con el espacio y las empresas de alquiler. Por defecto son dos semanas antes del evento y puedes cambiarla.',
      'Edita cualquiera de las dos fechas desde el panel con «Editar fechas».',
    ],
  },
  '2026-09-18-zones': {
    title: 'Zonas con código de color',
    items: [
      'Nuevo botón 🎨 Zonas en el editor: pinta áreas con nombre en una sala: pista de baile, barra, ceremonia, bufé, fotomatón, escenario/DJ, zona lounge o las tuyas.',
      'Dibuja un rectángulo arrastrando, o una forma libre haciendo clic en las esquinas y doble clic para terminar. Arrastra una zona para moverla y arrastra sus tiradores para cambiar su forma.',
      'Las zonas se muestran siempre bajo tus mesas; activa Zonas solo cuando quieras editarlas.',
      'La autodisposición mantiene ahora las mesas fuera de todas las zonas: dibuja primero la pista de baile y rellenará el resto de la sala a su alrededor.',
      'El resumen del proyecto enumera todas las zonas de cada sala con su tamaño.',
    ],
  },
  '2026-09-18-auto-arrange': {
    title: 'Autodisposición y la mesa de los novios',
    items: [
      'Nuevo botón ✨ Autodisposición en la barra del editor: elige cuántas mesas de cada tipo quieres y Venuria las distribuye por ti dentro de la sala, lejos de paredes, obstáculos y de todo lo que ya hayas colocado, con espacio de paso entre las mesas.',
      'El total de plazas tiene que coincidir exactamente con tu lista de invitados para que se ejecute, de modo que no puedas planificar sin querer para un número equivocado.',
      'Nueva mesa de los novios en el catálogo: una mesa de dos plazas para la pareja, con ambas sillas juntas en un mismo lado.',
      'Activa «Equilibrar en torno a la mesa de los novios» para reflejar tus mesas a ambos lados de ella. Una mesa sobrante queda sobre la línea central.',
      'Todo lo que coloca la autodisposición es una mesa normal: muévela, gírala, cambia sus sillas o elimínala como siempre.',
    ],
  },
}
