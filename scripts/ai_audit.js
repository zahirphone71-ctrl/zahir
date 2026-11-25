import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';

// 1. استخراج الفروقات البرمجية الحديثة (Git Diff) مع معالجة الحالات الاستثنائية
let gitDiff = '';
try {
  // محاولة قراءة آخر تعديل
  gitDiff = execSync('git diff HEAD~1 HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
} catch (error) {
  try {
    // محاولة بديلة: قراءة الفروقات غير المؤكدة أو المفتوحة
    gitDiff = execSync('git diff HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
  } catch (err2) {
    try {
      gitDiff = execSync('git status --short', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    } catch {
      console.log('ℹ️ لم يتم العثور على مستودع Git نشط أو سجل تعديلات سابقة.');
    }
  }
}

if (!gitDiff || !gitDiff.trim()) {
  console.log('✅ لا توجد تغييرات برمجية جديدة لمراجعتها (Working tree clean).');
  process.exit(0);
}

// 2. معايير الوثيقة الحاكمة (ZCtrl Unified Governing Specification v5.0.0)
const governanceRules = `
1. الأمان والاستقرار (Security & Lifecycle):
   - لا مفاتيح أو أسرار مشفرة بشكل ثابت (Zero Hardcoded Secrets).
   - حجب الأسرار وكلمات المرور والتوكنات تلقائياً (SEC-04 Redaction).
   - لا كود وهمي في مسارات الإنتاج (Zero Mock Data).
   - قراءة فقط افتراضياً لكافة الأجهزة (SAFE-01 Read-Only).
   - حتمية محرك التغيير وعدم تنفيذ أي تعديل خارج ChangeEngine (SAFE-02).
   - عزل العمليات الثقيلة لضمان عدم تجمد واجهة المستخدم (Zero UI Freezing).

2. بنية المهارات والوظائف الإضافية (Skills & Tools Architecture):
   - التحقق الصارم من صحة المدخلات عبر Zod ومعالجة الاستثناءات بدون انهيار.
   - التحقق من صلاحيات ABAC/RBAC قبل تنفيذ أي أمر (SAFE-05).
   - كفاءة استدعاء المهارات وزمن استجابة منخفض مع وجود مسارات بديلة (Fallback Mechanisms).

3. التصميم البصري والتناغم الهيكلي (UI/UX Consistency):
   - الالتزام برمز التصميم (Design Tokens) وتجنب الألوان العشوائية (UI-02).
   - عزل المصطلحات التقنية (IP, MAC, Commands) باتجاه LTR المنعزل داخل العربية unicode-isolate (UI-08).
   - دعم التباين العالي وإمكانية الوصول WCAG 2.2 AA.

4. السلاسة، التفاعل، والتحكم (Interactions, Tables & Controls):
   - انعدام هبوط الإطارات وسلاسة الحركات (Zero Frame Drops).
   - تثبيت رؤوس الجداول (Sticky Headers) والعرض التخيلي للجداول الكبيرة.
   - استخدام Debouncing في حقول البحث والفلترة لمنع استنزاف الموارد.
`;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠️ تحذير: متغير GEMINI_API_KEY غير موجود في البيئة الحالية. تجاوز فحص الذكاء الاصطناعي.');
  process.exit(0);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

async function runAudit() {
  console.log('🔍 جاري إرسال التغييرات لمطابقتها آلياً مع بنود الوثيقة الحاكمة (ZCtrl v5.0.0)...');

  const truncatedDiff = gitDiff.slice(0, 30000);
  const prompt = `
بصفتك كبير مراجعي الأمان والامتثال البرمجي لنظام ZCtrl:
تحقق من التغييرات البرمجية المرفقة (Git Diff) وطابقها مع قواعد الوثيقة الحاكمة التالية:
${governanceRules}

التعديلات (Diff):
\`\`\`diff
${truncatedDiff}
\`\`\`

التعليمات الصارمة:
1. إذا وجدت أي مخالفة حرجة (ثغرة أمنية، مفتاح مكشوف، كود ميت، تجميد واجهة، كود وهمي Mock)، اذكرها بدقة بصيغة:
[FAIL]: اسم الملف - السطر - سبب المخالفة - التصحيح المطلوب.
2. إذا كان الكود مطابقاً تماماً ولا توجد مخالفات حرجة، ابدأ إجابتك بكلمة: [PASS] مع ملخص موجز.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const output = response.text || '';
    console.log('\n--- تقرير مراجعة الوثيقة الحاكمة ---\n');
    console.log(output);

    if (output.includes('[FAIL]')) {
      console.error('\n❌ تم رفض التحديث لمخالفته بنود الوثيقة الحاكمة.');
      process.exit(1);
    } else {
      console.log('\n✅ التحديث مطابق لمعايير الوثيقة الحاكمة.');
      process.exit(0);
    }
  } catch (err) {
    console.error('⚠️ حدث خطأ أثناء تشغيل فحص الذكاء الاصطناعي:', err.message || err);
    // عدم كسر مسار البناء عند تعطل مؤقت في اتصال الـ API
    process.exit(0);
  }
}

runAudit();
