/* Seed demo users, connections, conversations, and messages.
   Run with: npm run seed  (after prisma migrate). */
import { PrismaClient, ConnectionType, ConnectionStatus, DeliveryStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

async function main(): Promise<void> {
  const password = await argon2.hash('password123');

  const [asha, ravi, drmeena, nutriKiran] = await Promise.all([
    prisma.user.upsert({
      where: { handle: 'asha' },
      update: {},
      create: { handle: 'asha', name: 'Asha Rao', passwordHash: password },
    }),
    prisma.user.upsert({
      where: { handle: 'ravi' },
      update: {},
      create: { handle: 'ravi', name: 'Ravi Kumar', passwordHash: password },
    }),
    prisma.user.upsert({
      where: { handle: 'dr_meena' },
      update: {},
      create: { handle: 'dr_meena', name: 'Dr. Meena Iyer', passwordHash: password },
    }),
    prisma.user.upsert({
      where: { handle: 'coach_kiran' },
      update: {},
      create: { handle: 'coach_kiran', name: 'Kiran (Nutritionist)', passwordHash: password },
    }),
  ]);

  const order = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

  // Connections: Asha↔Ravi (friends, accepted), Asha↔Dr Meena (doctor, accepted),
  // Ravi↔Kiran (nutritionist, PENDING → cannot chat yet).
  const [a1, a2] = order(asha.id, ravi.id);
  const [b1, b2] = order(asha.id, drmeena.id);
  const [c1, c2] = order(ravi.id, nutriKiran.id);

  await prisma.connection.upsert({
    where: { userOneId_userTwoId_connectionType: { userOneId: a1, userTwoId: a2, connectionType: ConnectionType.FRIEND } },
    update: { status: ConnectionStatus.ACCEPTED },
    create: { userOneId: a1, userTwoId: a2, connectionType: ConnectionType.FRIEND, status: ConnectionStatus.ACCEPTED, requestedById: asha.id },
  });
  await prisma.connection.upsert({
    where: { userOneId_userTwoId_connectionType: { userOneId: b1, userTwoId: b2, connectionType: ConnectionType.DOCTOR_PATIENT } },
    update: { status: ConnectionStatus.ACCEPTED },
    create: { userOneId: b1, userTwoId: b2, connectionType: ConnectionType.DOCTOR_PATIENT, status: ConnectionStatus.ACCEPTED, requestedById: drmeena.id },
  });
  await prisma.connection.upsert({
    where: { userOneId_userTwoId_connectionType: { userOneId: c1, userTwoId: c2, connectionType: ConnectionType.NUTRITIONIST_CLIENT } },
    update: { status: ConnectionStatus.PENDING },
    create: { userOneId: c1, userTwoId: c2, connectionType: ConnectionType.NUTRITIONIST_CLIENT, status: ConnectionStatus.PENDING, requestedById: nutriKiran.id },
  });

  // Direct conversation Asha ↔ Ravi with a few messages.
  const convo = await prisma.conversation.upsert({
    where: { directKey: directKey(asha.id, ravi.id) },
    update: {},
    create: {
      type: 'DIRECT',
      directKey: directKey(asha.id, ravi.id),
      members: { create: [{ userId: asha.id }, { userId: ravi.id }] },
    },
  });

  const existing = await prisma.message.count({ where: { conversationId: convo.id } });
  if (existing === 0) {
    const m1 = await prisma.message.create({
      data: {
        conversationId: convo.id,
        senderId: asha.id,
        text: 'Hey Ravi! Are we still on for the trek this weekend?',
        statuses: { create: [{ userId: ravi.id, status: DeliveryStatus.READ, readAt: new Date() }] },
      },
    });
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        senderId: ravi.id,
        text: 'Absolutely 🙌 Meeting at 6am at the north gate.',
        replyToMessageId: m1.id,
        statuses: { create: [{ userId: asha.id, status: DeliveryStatus.DELIVERED }] },
      },
    });
  }

  console.log('Seed complete:');
  console.log('  users: asha / ravi / dr_meena / coach_kiran  (password: password123)');
  console.log('  asha↔ravi FRIEND (accepted) — can chat');
  console.log('  asha↔dr_meena DOCTOR_PATIENT (accepted) — can chat');
  console.log('  ravi↔coach_kiran NUTRITIONIST_CLIENT (pending) — CANNOT chat (403)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
