CREATE TYPE public.emotion_category AS ENUM ('positive','negative','neutral');

CREATE TYPE public.communication_state AS ENUM (
  'confident','hesitant','blocked','overthinking','misunderstood',
  'need_translation','need_rephrase','need_social_help','need_explanation',
  'lack_of_confidence','motivated','low_motivation','social_pressure','learning'
);

CREATE TABLE public.emotion_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text_pattern TEXT NOT NULL,
  emotion TEXT NOT NULL,
  emotion_category public.emotion_category NOT NULL,
  intensity SMALLINT NOT NULL DEFAULT 5 CHECK (intensity BETWEEN 1 AND 10),
  communication_state public.communication_state NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'small_talk',
  user_need TEXT NOT NULL DEFAULT '',
  ai_response_strategy TEXT NOT NULL DEFAULT '',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX emotion_intelligence_keywords_idx ON public.emotion_intelligence USING GIN (keywords);
CREATE INDEX emotion_intelligence_lang_idx ON public.emotion_intelligence (language);

GRANT SELECT ON public.emotion_intelligence TO anon;
GRANT SELECT ON public.emotion_intelligence TO authenticated;
GRANT ALL ON public.emotion_intelligence TO service_role;

ALTER TABLE public.emotion_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emotion library readable by everyone"
  ON public.emotion_intelligence FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage emotion library"
  ON public.emotion_intelligence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER emotion_intelligence_updated_at
  BEFORE UPDATE ON public.emotion_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.emotion_intelligence
  (text_pattern, emotion, emotion_category, intensity, communication_state, scenario, user_need, ai_response_strategy, keywords, language)
VALUES
('I''m afraid I will say something wrong','anxiety','negative',8,'lack_of_confidence','job_interview','reduce anxiety and prepare answers','give reassurance and interview response templates','{afraid,wrong,nervous,mistake,worry}','en'),
('I don''t know what to answer','anxiety','negative',7,'overthinking','job_interview','a concrete answer to fall back on','offer 2-3 ready-made safe answers, shortest first','{answer,dont know,blank}','en'),
('I''m nervous about the interview','anxiety','negative',7,'lack_of_confidence','job_interview','calm down and rehearse','reassure, then rehearse one likely question','{nervous,interview,anxious,scared}','en'),
('I don''t know how to start the conversation','nervousness','negative',7,'hesitant','small_talk','need conversation opening','generate natural opening sentences','{start,conversation,opening,break the ice}','en'),
('My mind goes blank when I speak English','nervousness','negative',8,'blocked','presentation','step-by-step scaffolding','give one short sentence at a time, no long options','{blank,stuck,freeze,speechless}','en'),
('Sorry, could you repeat that?','embarrassment','negative',5,'misunderstood','customer_service','recover conversation politely','provide polite communication recovery phrases','{repeat,sorry,pardon,again}','en'),
('They repeated three times and I still feel awkward','embarrassment','negative',6,'social_pressure','restaurant_order','save face and keep going','offer a light self-deprecating recovery line plus the key phrase','{awkward,embarrassed,ashamed,repeat}','en'),
('What does this mean?','confusion','neutral',4,'need_explanation','class_discussion','understand meaning','explain simply with one concrete example','{meaning,understand,confused,what}','en'),
('Why did they say this?','confusion','negative',5,'misunderstood','networking','read the intent behind the words','explain the implied intent, then give a clarifying question','{why,intent,imply,unclear}','en'),
('Can you say that in simpler words?','confusion','neutral',4,'need_rephrase','hospital_visit','simpler wording','rephrase at a lower level and keep key terms','{simpler,rephrase,easy,slow}','en'),
('How do you say this in English?','confusion','neutral',3,'need_translation','travel','translate in context','translate naturally, not literally, and note register','{translate,how to say,in english}','en'),
('I studied for years but still cannot speak well','frustration','negative',8,'blocked','language_learning','motivation and improvement plan','provide progress analysis and learning advice','{cannot,improve,years,useless,slow}','en'),
('Why am I not improving?','frustration','negative',7,'low_motivation','language_learning','evidence of progress','name one concrete win, then one small next step','{improving,progress,stuck,tired}','en'),
('I think I can handle this interview','confidence','positive',7,'confident','job_interview','challenge improvement','provide advanced practice and harder follow-ups','{can,ready,handle,sure}','en'),
('I want to try it myself','confidence','positive',6,'motivated','small_talk','room to try','stay minimal, correct only after the attempt','{try,myself,ready}','en'),
('I am excited to meet new people','excitement','positive',7,'motivated','networking','encourage practice','create a challenging but fun scenario','{excited,meet,new people,fun}','en'),
('I want to practice more','excitement','positive',6,'motivated','language_learning','more reps','offer a quick drill with escalating difficulty','{practice,more,again}','en'),
('How do native speakers say this?','curiosity','positive',5,'learning','language_learning','natural phrasing','give the natural version plus the textbook one and the difference','{native,natural,really say}','en'),
('What is the natural expression here?','curiosity','positive',5,'learning','dating','sound natural','give 3 registers: casual, neutral, polite','{natural,expression,casual,polite}','en'),
('我怕说错话','anxiety','negative',8,'lack_of_confidence','job_interview','降低焦虑并准备好答案','先安抚，再给可直接照说的模板','{怕,说错,紧张,担心}','zh'),
('我不知道该怎么回答','anxiety','negative',7,'overthinking','job_interview','需要一句能直接用的话','给 2-3 个安全答案，从最短的开始','{不知道,怎么回答,空白}','zh'),
('我不知道怎么开口','nervousness','negative',7,'hesitant','small_talk','需要开场白','给自然的开场句','{开口,开场,搭话}','zh'),
('一说外语我脑子就一片空白','nervousness','negative',8,'blocked','presentation','需要一步一步引导','一次只给一句短句','{空白,卡住,忘词}','zh'),
('不好意思，能再说一遍吗','embarrassment','negative',5,'misunderstood','customer_service','礼貌地把对话接回来','给礼貌的补救说法','{再说一遍,不好意思,没听清}','zh'),
('他说了三遍我还是没懂，好尴尬','embarrassment','negative',6,'social_pressure','restaurant_order','化解尴尬并继续','给一句轻松的自嘲式补救 + 关键句','{尴尬,没懂,重复}','zh'),
('这是什么意思？','confusion','neutral',4,'need_explanation','class_discussion','理解含义','用一个具体例子简单解释','{什么意思,不懂,解释}','zh'),
('能说得简单一点吗','confusion','neutral',4,'need_rephrase','hospital_visit','更简单的说法','降低难度改述，保留关键词','{简单,换个说法,慢一点}','zh'),
('我学了很久还是说不出口','frustration','negative',8,'blocked','language_learning','需要动力和方法','指出具体进步，再给一个小步骤','{说不出口,没进步,学了很久}','zh'),
('我觉得我可以','confidence','positive',7,'confident','job_interview','想要更高难度','给进阶练习和追问','{可以,准备好,没问题}','zh'),
('我想多练几次','excitement','positive',6,'motivated','language_learning','想要更多练习','给递进难度的小练习','{多练,再来,练习}','zh'),
('母语者一般怎么说？','curiosity','positive',5,'learning','language_learning','地道说法','给地道说法 + 教科书说法及差别','{母语者,地道,一般怎么说}','zh'),
('間違えたらどうしよう','anxiety','negative',8,'lack_of_confidence','job_interview','不安を下げて答えを準備する','安心させてから使える定型文を渡す','{間違え,不安,緊張}','ja'),
('何て言えばいいか分からない','nervousness','negative',7,'hesitant','small_talk','会話の切り出し方','自然な出だしの一文を渡す','{分からない,言えば,きっかけ}','ja'),
('すみません、もう一度お願いします','embarrassment','negative',5,'misunderstood','customer_service','丁寧に会話を立て直す','丁寧な聞き返し表現を渡す','{もう一度,すみません,聞き取れ}','ja'),
('これはどういう意味ですか','confusion','neutral',4,'need_explanation','class_discussion','意味を理解する','例を一つ添えて簡単に説明する','{意味,分からない,説明}','ja'),
('ネイティブは何て言いますか','curiosity','positive',5,'learning','language_learning','自然な言い方','自然な言い方と教科書的な言い方の違いを示す','{ネイティブ,自然,言い方}','ja');