-- HR > Interviews: candidates, scheduled and walk-in interviews, editable forms, full trail.
-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "cnic" TEXT,
    "gender" TEXT,
    "dateOfBirth" DATE,
    "city" TEXT,
    "address" TEXT,
    "education" TEXT,
    "experienceYears" DECIMAL(4,1),
    "callCenterYears" DECIMAL(4,1),
    "lastCompany" TEXT,
    "lastDesignation" TEXT,
    "currentSalary" INTEGER,
    "expectedSalary" INTEGER,
    "preferredShift" TEXT,
    "availableFrom" DATE,
    "source" TEXT,
    "referredBy" TEXT,
    "cvKey" TEXT,
    "cvName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_forms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "formId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "mode" TEXT NOT NULL DEFAULT 'In person',
    "location" TEXT,
    "interviewerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "formSnapshot" JSONB,
    "answers" JSONB,
    "rating" INTEGER,
    "remarks" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_events" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "data" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidates_phone_idx" ON "candidates"("phone");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "interviews_status_scheduledAt_idx" ON "interviews"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "interviews_candidateId_idx" ON "interviews"("candidateId");

-- CreateIndex
CREATE INDEX "interview_events_interviewId_createdAt_idx" ON "interview_events"("interviewId", "createdAt");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_formId_fkey" FOREIGN KEY ("formId") REFERENCES "interview_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_events" ADD CONSTRAINT "interview_events_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_events" ADD CONSTRAINT "interview_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starter interview forms; HR adds, edits or removes questions under Interviews > Forms
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_medicare_agent', 'Medicare Agent', 'SCHEDULED', 'Agent for Medicare campaigns', '[{"id":"q1","label":"Tell us about yourself and your background","type":"textarea","required":false},{"id":"q2","label":"Communication and English fluency","type":"rating","required":false},{"id":"q3","label":"Accent and voice clarity on the phone","type":"rating","required":false},{"id":"q4","label":"Call center or sales experience (where, how long, which campaigns)","type":"textarea","required":false},{"id":"q5","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q6","label":"Typing speed (words per minute)","type":"number","required":false},{"id":"q7","label":"Knowledge of Medicare (Parts A, B, C, D, Advantage, Supplements)","type":"rating","required":false},{"id":"q8","label":"Worked on Medicare campaigns before","type":"yesno","required":false},{"id":"q9","label":"Understands compliance (no misleading claims, caller consent)","type":"yesno","required":false},{"id":"q10","label":"Mock call: opening, tone and confidence","type":"rating","required":false},{"id":"q11","label":"Mock call: handling objections","type":"rating","required":false},{"id":"q12","label":"Mock call: closing / transfer","type":"rating","required":false},{"id":"q13","label":"Why do you want to join Meta Voice?","type":"textarea","required":false},{"id":"q14","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]}]'::jsonb, true, 1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_final_expense_agent', 'Final Expense Agent', 'SCHEDULED', 'Agent for Final Expense campaigns', '[{"id":"q1","label":"Tell us about yourself and your background","type":"textarea","required":false},{"id":"q2","label":"Communication and English fluency","type":"rating","required":false},{"id":"q3","label":"Accent and voice clarity on the phone","type":"rating","required":false},{"id":"q4","label":"Call center or sales experience (where, how long, which campaigns)","type":"textarea","required":false},{"id":"q5","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q6","label":"Typing speed (words per minute)","type":"number","required":false},{"id":"q7","label":"Understands Final Expense / burial insurance","type":"rating","required":false},{"id":"q8","label":"Worked on Final Expense campaigns before","type":"yesno","required":false},{"id":"q9","label":"Empathy and patience with elderly callers","type":"rating","required":false},{"id":"q10","label":"Mock call: opening, tone and confidence","type":"rating","required":false},{"id":"q11","label":"Mock call: handling objections","type":"rating","required":false},{"id":"q12","label":"Mock call: closing / transfer","type":"rating","required":false},{"id":"q13","label":"Why do you want to join Meta Voice?","type":"textarea","required":false},{"id":"q14","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]}]'::jsonb, true, 2, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_auto_insurance_agent', 'Auto Insurance Agent', 'SCHEDULED', 'Agent for Auto campaigns', '[{"id":"q1","label":"Tell us about yourself and your background","type":"textarea","required":false},{"id":"q2","label":"Communication and English fluency","type":"rating","required":false},{"id":"q3","label":"Accent and voice clarity on the phone","type":"rating","required":false},{"id":"q4","label":"Call center or sales experience (where, how long, which campaigns)","type":"textarea","required":false},{"id":"q5","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q6","label":"Typing speed (words per minute)","type":"number","required":false},{"id":"q7","label":"Knowledge of auto insurance terms (coverage, deductible, premium)","type":"rating","required":false},{"id":"q8","label":"Worked on Auto campaigns before","type":"yesno","required":false},{"id":"q9","label":"Collects vehicle and driver details accurately","type":"rating","required":false},{"id":"q10","label":"Mock call: opening, tone and confidence","type":"rating","required":false},{"id":"q11","label":"Mock call: handling objections","type":"rating","required":false},{"id":"q12","label":"Mock call: closing / transfer","type":"rating","required":false},{"id":"q13","label":"Why do you want to join Meta Voice?","type":"textarea","required":false},{"id":"q14","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]}]'::jsonb, true, 3, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_agent_general', 'Agent (General)', 'SCHEDULED', 'Any agent position', '[{"id":"q1","label":"Tell us about yourself and your background","type":"textarea","required":false},{"id":"q2","label":"Communication and English fluency","type":"rating","required":false},{"id":"q3","label":"Accent and voice clarity on the phone","type":"rating","required":false},{"id":"q4","label":"Call center or sales experience (where, how long, which campaigns)","type":"textarea","required":false},{"id":"q5","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q6","label":"Typing speed (words per minute)","type":"number","required":false},{"id":"q7","label":"Which campaign suits the candidate best","type":"choice","required":false,"options":["Medicare","Final Expense","Auto","Other"]},{"id":"q8","label":"Mock call: opening, tone and confidence","type":"rating","required":false},{"id":"q9","label":"Mock call: handling objections","type":"rating","required":false},{"id":"q10","label":"Mock call: closing / transfer","type":"rating","required":false},{"id":"q11","label":"Why do you want to join Meta Voice?","type":"textarea","required":false},{"id":"q12","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]}]'::jsonb, true, 4, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_manager_team_lead', 'Manager / Team Lead', 'SCHEDULED', 'Floor manager, team lead or QA', '[{"id":"q1","label":"Tell us about your management experience","type":"textarea","required":false},{"id":"q2","label":"Largest team size you have managed","type":"number","required":false},{"id":"q3","label":"Communication and English fluency","type":"rating","required":false},{"id":"q4","label":"How do you handle an under-performing agent?","type":"textarea","required":false},{"id":"q5","label":"Handling escalations and difficult calls","type":"rating","required":false},{"id":"q6","label":"KPI knowledge (conversion, AHT, QA scores, transfers)","type":"rating","required":false},{"id":"q7","label":"Dialers and CRMs used","type":"text","required":false},{"id":"q8","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q9","label":"Leadership style","type":"textarea","required":false},{"id":"q10","label":"Why do you want to join Meta Voice?","type":"textarea","required":false},{"id":"q11","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]}]'::jsonb, true, 5, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_walk_in_agent', 'Walk-in Agent', 'WALK_IN', 'Quick screening for an agent who walks in', '[{"id":"q1","label":"Position interested in","type":"choice","required":false,"options":["Medicare","Final Expense","Auto","Other"]},{"id":"q2","label":"Communication and English fluency","type":"rating","required":false},{"id":"q3","label":"Accent and voice clarity on the phone","type":"rating","required":false},{"id":"q4","label":"Call center experience","type":"textarea","required":false},{"id":"q5","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q6","label":"Can start from","type":"text","required":false},{"id":"q7","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]},{"id":"q8","label":"Invite for a full interview","type":"yesno","required":false}]'::jsonb, true, 6, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "interview_forms" ("id", "name", "kind", "description", "questions", "isActive", "sortOrder", "updatedAt") VALUES ('ifm_walk_in_manager_staff', 'Walk-in Manager / Staff', 'WALK_IN', 'Quick screening for a manager or support role', '[{"id":"q1","label":"Role interested in","type":"choice","required":false,"options":["Floor Manager / Team Lead","QA","HR","Accounts","Other"]},{"id":"q2","label":"Relevant experience","type":"textarea","required":false},{"id":"q3","label":"Communication and English fluency","type":"rating","required":false},{"id":"q4","label":"Comfortable working the night shift (US hours)","type":"yesno","required":false},{"id":"q5","label":"Can start from","type":"text","required":false},{"id":"q6","label":"Overall impression","type":"choice","required":false,"options":["Strong","Average","Weak"]},{"id":"q7","label":"Invite for a full interview","type":"yesno","required":false}]'::jsonb, true, 7, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
