ALTER TABLE public.memories ADD COLUMN image_url text;

-- Storage policies for the private "memory" bucket (files owned by the authenticated user).
CREATE POLICY "memory users select own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'memory' AND owner = auth.uid());

CREATE POLICY "memory users insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'memory' AND name LIKE auth.uid()::text || '/%');

CREATE POLICY "memory users update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'memory' AND owner = auth.uid())
WITH CHECK (bucket_id = 'memory' AND name LIKE auth.uid()::text || '/%');

CREATE POLICY "memory users delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'memory' AND owner = auth.uid());