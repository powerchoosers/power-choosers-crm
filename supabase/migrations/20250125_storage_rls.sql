vault\
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'vault');
    END IF;
END \$\$;
